"""Graceful cancellation of long reads on client disconnect (ADR-0021).

Two things are pinned here, and the second matters more than the first:

* the mechanism works — a disconnected client's scan is actually cancelled,
  and a connected client's is not;
* the mechanism is applied **only to reads**. Cancelling a write mid-flight
  leaves the cluster in a state nobody chose and nobody recorded.
"""

from __future__ import annotations

import ast
import asyncio
import pathlib
from typing import ClassVar

import pytest

from aerospike_cluster_manager_api.middleware.cancellation import (
    ClientDisconnected,
    run_cancellable,
)


class _FakeRequest:
    """Minimal stand-in for ``starlette.requests.Request``.

    ``disconnect_after`` = how many probes to answer "connected" before
    reporting the client has gone. ``None`` means never.
    """

    def __init__(self, disconnect_after: int | None = None) -> None:
        self._disconnect_after = disconnect_after
        self.probes = 0

    async def is_disconnected(self) -> bool:
        self.probes += 1
        if self._disconnect_after is None:
            return False
        return self.probes > self._disconnect_after


class _BlockingRequest(_FakeRequest):
    """A request whose disconnect probe never returns.

    This is the real behaviour behind ``BaseHTTPMiddleware`` (this app runs
    two: SlowAPI and TraceID), and the reason ``_client_is_gone`` bounds every
    probe. Without the bound, the request wedges — which is exactly how the
    first draft of this module hung the whole test suite.
    """

    async def is_disconnected(self) -> bool:
        self.probes += 1
        await asyncio.Event().wait()  # never returns
        raise AssertionError("unreachable")


class TestCompletesNormally:
    async def test_returns_the_result_when_work_finishes_first(self):
        async def work():
            return "scan result"

        assert await run_cancellable(_FakeRequest(), work(), label="scan") == "scan result"

    async def test_a_fast_read_is_not_polled_at_all(self):
        """Zero overhead on the common case."""

        async def work():
            return 1

        request = _FakeRequest()
        await run_cancellable(request, work(), label="scan")
        assert request.probes == 0

    async def test_exceptions_propagate_unchanged(self):
        class Boom(Exception):
            pass

        async def work():
            raise Boom("cluster said no")

        with pytest.raises(Boom, match="cluster said no"):
            await run_cancellable(_FakeRequest(), work(), label="scan")

    async def test_a_slow_read_survives_a_connected_client(self):
        """Polling must not cut short work for someone still waiting."""

        async def work():
            await asyncio.sleep(0.25)
            return "done"

        request = _FakeRequest()
        result = await run_cancellable(request, work(), label="scan", poll_interval=0.01)
        assert result == "done"
        assert request.probes > 1, "expected the client to have been polled"


class TestCancelsOnDisconnect:
    async def test_raises_client_disconnected(self):
        async def work():
            await asyncio.sleep(30)

        with pytest.raises(ClientDisconnected) as exc_info:
            await run_cancellable(_FakeRequest(disconnect_after=1), work(), label="scan test.demo", poll_interval=0.01)
        assert exc_info.value.label == "scan test.demo"

    async def test_the_work_is_actually_cancelled_not_merely_abandoned(self):
        """The point of the whole exercise.

        Scheduling a cancellation is not enough — an un-awaited task can run on
        past the response, which leaves exactly the resource leak ADR-0021 is
        about. This asserts the coroutine really stopped.
        """
        stopped = asyncio.Event()
        completed = False

        async def work():
            nonlocal completed
            try:
                await asyncio.sleep(30)
                completed = True
            except asyncio.CancelledError:
                stopped.set()
                raise

        with pytest.raises(ClientDisconnected):
            await run_cancellable(_FakeRequest(disconnect_after=1), work(), label="scan", poll_interval=0.01)

        assert stopped.is_set(), "the read was never told to stop"
        assert not completed
        # Give the loop a chance to run any stragglers; nothing may resurrect.
        await asyncio.sleep(0.05)
        assert not completed


class TestNeverWedges:
    async def test_a_blocking_disconnect_probe_does_not_hang_the_request(self):
        """Bounded probes — see ``_BlockingRequest``."""

        async def work():
            await asyncio.sleep(0.2)
            return "done"

        request = _BlockingRequest()
        result = await asyncio.wait_for(
            run_cancellable(request, work(), label="scan", poll_interval=0.01),
            timeout=5.0,
        )
        assert result == "done"
        assert request.probes > 0, "expected the blocking probe to have been attempted"

    async def test_an_unanswerable_probe_is_read_as_still_connected(self):
        """Finishing work for a departed client wastes a scan; abandoning work
        for a present one loses their result. The latter is worse."""

        async def work():
            await asyncio.sleep(0.15)
            return "done"

        assert (
            await asyncio.wait_for(
                run_cancellable(_BlockingRequest(), work(), label="scan", poll_interval=0.01),
                timeout=5.0,
            )
            == "done"
        )


class TestServerCancellationIsNotAClientDisconnect:
    async def test_outer_cancellation_propagates_and_takes_the_work_down(self):
        """Shutdown or an outer timeout must not be reported as a disconnect."""
        stopped = asyncio.Event()

        async def work():
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                stopped.set()
                raise

        task = asyncio.ensure_future(run_cancellable(_FakeRequest(), work(), label="scan", poll_interval=0.01))
        await asyncio.sleep(0.05)
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task
        assert stopped.is_set(), "the inner read outlived the cancelled request"


class TestTheReadIsFinishedBeforeWeReturn:
    """``work.cancel()`` alone is not enough, on either exit path.

    ``cancel()`` merely *schedules* cancellation. Without awaiting the task
    afterwards, ``run_cancellable`` can raise while the read is still on the
    event loop — the resource leak ADR-0021 exists to close, wearing the
    appearance of a fix.

    There are two such ``await asyncio.gather(work, ...)`` lines, one per exit
    path, and each needs its own test. Deleting the client-disconnect one turns
    ``test_the_work_is_actually_cancelled_not_merely_abandoned`` red; deleting
    the server-cancellation one left the entire suite green until this class
    existed.

    Each test drives the work past its cancel point into a cleanup that takes
    real time, then asserts the task is ``done()`` by the time the caller sees
    the exception. A caller that returned early would observe it still running.
    """

    @staticmethod
    def _slow_to_stop():
        """Work whose cleanup outlives its cancel point.

        Returns ``(state, coroutine)``. ``state["task"]`` is the task the work
        runs as, captured from inside it; ``state["cleanup_finished"]`` flips
        only after the post-cancel cleanup completes.
        """
        state: dict = {"cleanup_finished": False}

        async def work():
            state["task"] = asyncio.current_task()
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                # Cleanup that runs *after* the cancel point and takes time —
                # closing a scan cursor, releasing a client. A caller that does
                # not wait returns while this is still going.
                await asyncio.sleep(0.05)
                state["cleanup_finished"] = True
                raise

        return state, work()

    async def test_client_disconnect_path_waits_for_the_read_to_stop(self):
        state, coro = self._slow_to_stop()

        with pytest.raises(ClientDisconnected):
            await run_cancellable(_FakeRequest(disconnect_after=1), coro, label="scan", poll_interval=0.01)

        assert state["task"].done(), (
            "run_cancellable raised while the read was still on the event loop; "
            "work.cancel() only schedules cancellation — the await after it is load-bearing"
        )
        assert state["cleanup_finished"], "returned before the read finished unwinding"

    async def test_server_cancellation_path_waits_for_the_read_to_stop(self):
        state, coro = self._slow_to_stop()

        task = asyncio.ensure_future(run_cancellable(_FakeRequest(), coro, label="scan", poll_interval=0.01))
        await asyncio.sleep(0.05)
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task

        assert state["task"].done(), "the request was torn down while the read was still on the event loop"
        assert state["cleanup_finished"], "returned before the read finished unwinding"


class TestOnlyReadsAreCancellable:
    """The safety rule, enforced mechanically.

    Cancelling a write mid-flight is the failure this must never cause: a
    partially applied batch, or a truncate that reached some nodes, leaves
    state nobody chose and nobody recorded. Abandoning a read costs only a
    wasted scan.

    The check parses every source file in the package from disk, rather than
    walking ``app.routes`` and calling ``inspect.getsource``. Two reasons, both
    learned the hard way:

    * An earlier version walked the route table and returned *nothing* once
      another test module had called ``importlib.reload`` on ``main`` — it
      would have passed vacuously while enforcing nothing.
      ``test_the_scan_is_actually_covered`` is the vacuity guard for that.
    * A later version globbed ``routers/*.py`` only, while claiming to cover
      the route table. A ``run_cancellable``-wrapped ``client.truncate(...)``
      added to ``services/records_service.py`` passed every test. Reaching a
      service normally requires a ``Request``, which services do not have — so
      the likelihood was low — but the check now scans the whole package and
      the docstring says what it actually does.
    """

    PACKAGE = pathlib.Path(__file__).resolve().parents[1] / "src" / "aerospike_cluster_manager_api"

    # ``run_cancellable`` is defined here, so its own module is the one place
    # the name may appear without being a call site under review.
    DEFINING_MODULE = "middleware/cancellation.py"

    # Handler names permitted to wrap work in ``run_cancellable``. Every one is
    # a read. Adding a name here is the moment to ask whether it mutates.
    ALLOWED_READ_HANDLERS: ClassVar[set[str]] = {
        "get_records",  # GET  /records/{conn_id}          — scan
        "get_filtered_records",  # POST /records/{conn_id}/filter  — filtered scan
        "execute_query",  # POST /query/{conn_id}           — query / full scan
    }

    # Names that must never appear as cancellable, listed explicitly so the
    # test fails loudly rather than relying on the allowlist staying short.
    KNOWN_MUTATIONS: ClassVar[set[str]] = {
        "put_record",
        "delete_record",
        "delete_record_bin",
        "truncate_set",
        "configure_namespace",
        "execute_info",
        "create_connection",
        "update_connection",
        "delete_connection",
        "create_k8s_cluster",
        "scale_k8s_cluster",
        "delete_k8s_cluster",
        "update_k8s_cluster",
    }

    def _handlers_using_run_cancellable(self) -> set[str]:
        """Return every function in the package whose body calls ``run_cancellable(``.

        Whole package, not just ``routers/`` — see the class docstring.
        """
        found: set[str] = set()
        for path in sorted(self.PACKAGE.rglob("*.py")):
            if path.as_posix().endswith(self.DEFINING_MODULE):
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if not isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef):
                    continue
                for call in ast.walk(node):
                    if (
                        isinstance(call, ast.Call)
                        and isinstance(call.func, ast.Name)
                        and call.func.id == "run_cancellable"
                    ):
                        found.add(node.name)
        return found

    def test_the_scan_is_actually_covered(self):
        """Vacuity guard — the rest of this class is meaningless if empty."""
        assert self._handlers_using_run_cancellable(), (
            "nothing in the package calls run_cancellable; the safety checks below would pass vacuously"
        )

    def test_only_allowlisted_read_handlers_are_cancellable(self):
        used = self._handlers_using_run_cancellable()
        unexpected = used - self.ALLOWED_READ_HANDLERS
        assert not unexpected, (
            f"made cancellable without review: {sorted(unexpected)}. "
            "If it mutates anything, do not cancel it — see middleware/cancellation.py."
        )

    def test_no_known_mutation_is_cancellable(self):
        used = self._handlers_using_run_cancellable()
        offenders = used & self.KNOWN_MUTATIONS
        assert not offenders, f"mutating operation(s) must never be cancellable: {sorted(offenders)}"

    def test_the_allowlist_and_the_denylist_do_not_overlap(self):
        """Cheap contradiction check on the two lists above."""
        assert not (self.ALLOWED_READ_HANDLERS & self.KNOWN_MUTATIONS)

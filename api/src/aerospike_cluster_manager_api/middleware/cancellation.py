"""Cancel long-running reads when the client goes away (ADR-0021).

A record-browser scan or a filtered query can read a very large number of
records. When the operator closes the tab or navigates away, the HTTP
connection drops but the coroutine keeps running to completion — the server
finishes work whose result nobody will ever read. On a set with millions of
records that is minutes of wasted scan per abandoned request, and the
abandoned requests stack.

ADR-0021 evaluated two mechanisms and recommended combining them, which is what
:func:`run_cancellable` does:

* **Option A** — poll :meth:`starlette.requests.Request.is_disconnected`.
  Detects the actual event we care about (the client left) rather than
  guessing with a timer.
* **Option B** — run the work as an :class:`asyncio.Task` so it can be
  cancelled. Polling alone cannot stop anything: ``filter_records`` is a single
  ``await`` that returns a list, not a loop with a convenient ``break`` point.

The ADR's sketch assumes a ``StreamingResponse`` over an async record
iterator, and its own compatibility row requires "기존 API 스펙 변경 없음" — no
API-spec change. Those cannot both hold for ``POST /records/{conn_id}/filter``,
which returns a JSON object. Task cancellation is what satisfies the constraint
the ADR insists on, so that is the shape used here; the streaming variant would
be a separate, breaking change.

**Reads only.** This must never wrap a mutating operation. Cancelling a write
mid-flight leaves the cluster in a state nobody chose and nobody recorded — a
partially applied batch, a truncate that took some nodes. Abandoning a *read*
costs a wasted scan; abandoning a *write* costs correctness. The rule is
enforced by ``tests/test_cancellation.py::TestOnlyReadsAreCancellable``, which
walks the route table rather than trusting reviewers to notice.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

from starlette.requests import Request

logger = logging.getLogger(__name__)

# How often to ask whether the client is still there.
#
# ``is_disconnected()`` reads the ASGI receive channel; it is cheap but not
# free. 0.5s bounds the wasted work at half a second past the disconnect while
# adding at most a couple of probes to a typical sub-second query. The ADR
# suggests "every 100 records", which does not apply to a non-streaming call —
# there is no record loop to count in — so this is the time-based equivalent.
DEFAULT_POLL_INTERVAL_S = 0.5

# Upper bound on a single disconnect probe.
#
# ``Request.is_disconnected()`` reads from the ASGI receive channel and, behind
# ``BaseHTTPMiddleware`` (this app has two: SlowAPI and TraceID), that read can
# block instead of returning "nothing available". Bounding the probe means an
# unanswerable question costs 50ms and is treated as "still connected" rather
# than wedging the request.
_PROBE_TIMEOUT_S = 0.05


class ClientDisconnected(Exception):
    """Raised when a read was cancelled because the client had gone.

    Not an error condition: nobody is left to receive a response. Routers let
    it propagate; Starlette discards the response for a closed connection
    anyway. It exists so the cancellation is *visible* — in a log line — rather
    than looking like a silent early return.
    """

    def __init__(self, label: str) -> None:
        super().__init__(f"client disconnected during {label}; work cancelled")
        self.label = label


async def _client_is_gone(request: Request) -> bool:
    """Ask whether the client has disconnected, without ever blocking.

    Two hard-won constraints are encoded here, both verified by experiment
    rather than by reading the framework:

    1. **The probe must be bounded.** Behind ``BaseHTTPMiddleware`` the
       underlying ``receive()`` can block rather than reporting "no message",
       so an unbounded probe wedges the request.

    2. **The probe must run in the caller's own coroutine, never in a task we
       later cancel.** ``is_disconnected()`` executes inside an already
       cancelled ``anyio.CancelScope`` (that is how Starlette makes it
       non-blocking), and that scope *absorbs* an external ``task.cancel()``.
       A watcher task parked in there ignores cancellation and spins forever —
       which is precisely how the first version of this module hung the test
       suite. Hence the polling loop below runs inline and only ever cancels
       ``work``, which is our own coroutine and cancels normally.

    An indeterminate answer is treated as "still connected": finishing work
    for a client who left wastes a scan, whereas abandoning work for a client
    who is still there loses their result.
    """
    try:
        return await asyncio.wait_for(request.is_disconnected(), _PROBE_TIMEOUT_S)
    except TimeoutError:
        return False


async def run_cancellable[T](
    request: Request,
    coro: Coroutine[Any, Any, T],
    *,
    label: str,
    poll_interval: float = DEFAULT_POLL_INTERVAL_S,
) -> T:
    """Run ``coro``, cancelling it if the client disconnects first.

    Args:
        request: the live request, polled for disconnection.
        coro: the READ to run. Never pass a mutating operation — see the
            module docstring.
        label: identifies the work in logs and in the raised exception.
        poll_interval: seconds between disconnect checks.

    Returns:
        Whatever ``coro`` returns, when it finishes first.

    Raises:
        ClientDisconnected: the client went away and ``coro`` was cancelled.
        Anything ``coro`` raises, unchanged.
    """
    work: asyncio.Task[T] = asyncio.ensure_future(coro)

    try:
        while True:
            # Waiting on the work with a timeout costs nothing when it finishes
            # first, and needs no second task — see ``_client_is_gone`` for why
            # a watcher task is not an option.
            done, _pending = await asyncio.wait({work}, timeout=poll_interval)
            if work in done:
                return work.result()

            if await _client_is_gone(request):
                work.cancel()
                # Awaiting is what makes the cancellation real. Without it the
                # task is merely *scheduled* for cancellation and can run on
                # past the response — leaving the resource leak this exists to
                # fix.
                await asyncio.gather(work, return_exceptions=True)
                logger.info("Client disconnected during %s; cancelled the in-flight read", label)
                raise ClientDisconnected(label)
    except asyncio.CancelledError:
        # The *server* is cancelling us (shutdown, or an outer timeout). Take
        # the work down with us, but report it as cancellation rather than as
        # a client disconnect.
        work.cancel()
        await asyncio.gather(work, return_exceptions=True)
        raise

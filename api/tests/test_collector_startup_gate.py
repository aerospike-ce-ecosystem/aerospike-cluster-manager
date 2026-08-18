"""The event collector does not start when it could only idle (#474).

``SSE_ENABLED`` defaults true, so three collector loops started on every boot.
But every publish body in ``events.collector`` returns on its first statement
when ``CM_SSE_BROADCAST_PER_CONNECTION`` is false — which is the default,
because the broker has no per-subscriber owner filter — so the loops woke on
2s / 30s / 5s timers forever and produced nothing.

The lifespan now requires both flags. These tests pin the truth table, and the
matching frontend half (polling, so metrics are not simply frozen instead) is
in ``ui/src/hooks/use-cluster.test.ts``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.main import app, lifespan


@pytest.fixture()
def collector_mocks():
    """Patch the collector and db so the lifespan can run without a cluster."""
    with (
        patch("aerospike_cluster_manager_api.main.db.init_db", AsyncMock()),
        patch("aerospike_cluster_manager_api.main.db.close_db", AsyncMock()),
        patch("aerospike_cluster_manager_api.main.client_manager.close_all", AsyncMock()),
        patch("aerospike_cluster_manager_api.main.collector.start", AsyncMock()) as start,
        patch("aerospike_cluster_manager_api.main.collector.stop", AsyncMock()) as stop,
    ):
        yield start, stop


async def _run_lifespan() -> None:
    # The real app object, because the shutdown half walks its middleware
    # stack looking for the OIDC middleware's JWKS client.
    async with lifespan(app):
        pass


class TestCollectorStartupGate:
    @pytest.mark.parametrize(
        ("sse_enabled", "broadcast", "should_start"),
        [
            # The default configuration: loops would idle, so do not pay for them.
            (True, False, False),
            # Opted in — the loops can actually publish.
            (True, True, True),
            # SSE off entirely.
            (False, False, False),
            (False, True, False),
        ],
    )
    async def test_truth_table(self, collector_mocks, sse_enabled, broadcast, should_start):
        start, stop = collector_mocks
        with (
            patch("aerospike_cluster_manager_api.config.SSE_ENABLED", sse_enabled),
            patch("aerospike_cluster_manager_api.config.CM_SSE_BROADCAST_PER_CONNECTION", broadcast),
        ):
            await _run_lifespan()

        assert start.await_count == (1 if should_start else 0)
        # stop must mirror start exactly — calling stop on a collector that
        # never started would gather an empty task list and log a misleading
        # "EventCollector stopped".
        assert stop.await_count == start.await_count

    async def test_explains_itself_in_the_log(self, collector_mocks):
        """An operator who expected live events should find the reason.

        Silence is what made this hard to spot: the collector logged
        "EventCollector started (2 loops)" and then never published anything.

        Asserted by patching the module logger rather than via ``caplog``:
        ``observability.setup_logging`` installs its own handlers and turns
        propagation off, so caplog's root handler never sees these records.
        """
        with (
            patch("aerospike_cluster_manager_api.config.SSE_ENABLED", True),
            patch("aerospike_cluster_manager_api.config.CM_SSE_BROADCAST_PER_CONNECTION", False),
            patch("aerospike_cluster_manager_api.main.logger.info") as info,
        ):
            await _run_lifespan()

        messages = " ".join(str(call.args[0]) for call in info.call_args_list if call.args)
        assert "CM_SSE_BROADCAST_PER_CONNECTION" in messages
        assert "NOT started" in messages

    async def test_says_nothing_when_the_collector_does_start(self, collector_mocks):
        """No misleading "not started" line on a deployment that opted in."""
        with (
            patch("aerospike_cluster_manager_api.config.SSE_ENABLED", True),
            patch("aerospike_cluster_manager_api.config.CM_SSE_BROADCAST_PER_CONNECTION", True),
            patch("aerospike_cluster_manager_api.main.logger.info") as info,
        ):
            await _run_lifespan()

        messages = " ".join(str(call.args[0]) for call in info.call_args_list if call.args)
        assert "NOT started" not in messages

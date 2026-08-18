"""The SSE stream applies the same workspace ACL as the REST routes (#496).

#471 / PR #483 closed the pull path: all 24 ``{name}`` routes in
``routers/k8s_clusters`` gate on the workspace label, and the list filter fails
closed. The push path had no filter at all — ``events/collector`` published the
full CR of every cluster and ``routers/events`` fanned it to every subscriber,
so a tenant received unasked exactly the objects that 404 for them on REST.

The lesson these tests encode: a gate is only as good as its *least* guarded
consumer. ``workspace_acl`` now holds the single rule and both consumers import
it, so a third consumer cannot quietly reintroduce this.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from aerospike_cluster_manager_api.models.workspace import SYSTEM_OWNER_ID
from aerospike_cluster_manager_api.routers.events import _is_event_visible

TENANT = "user-tenant-a"


def _k8s_event(kind: str = "detail", workspace_id: str | None = None) -> dict:
    """An envelope shaped like what ``EventCollector._publish_k8s`` emits."""
    return {
        "event": f"k8s.cluster.{kind}",
        "data": {"metadata": {"name": "demo", "namespace": "aerospike"}},
        "id": f"k8s-{kind}-aerospike-demo-1",
        "timestamp": 1,
        "workspaceId": workspace_id,
    }


class TestUnlabelledClustersDoNotReachTenants:
    """The exact bypass: what 404s on REST must not arrive over SSE."""

    @pytest.mark.parametrize("kind", ["detail", "events", "health"])
    async def test_tenant_does_not_receive_an_unlabelled_cluster(self, kind: str) -> None:
        assert await _is_event_visible(_k8s_event(kind), TENANT) is False

    @pytest.mark.parametrize("kind", ["detail", "events", "health"])
    async def test_system_caller_still_receives_it(self, kind: str) -> None:
        # Same rule as the REST gate: unlabelled means "ACM did not create
        # this", visible to the system caller only.
        assert await _is_event_visible(_k8s_event(kind), SYSTEM_OWNER_ID) is True

    async def test_all_three_event_families_are_covered(self) -> None:
        """``events`` and ``health`` carry no labels of their own.

        Their payloads are ``{namespace, name, ...}`` — attribution has to be
        stamped by the collector, where the CR is in hand. If it were not, they
        would be the two families that slipped through.
        """
        for kind in ("detail", "events", "health"):
            assert await _is_event_visible(_k8s_event(kind), TENANT) is False


class TestLabelledClusterVisibility:
    async def test_owner_receives_their_own_workspace(self) -> None:
        with patch(
            "aerospike_cluster_manager_api.workspace_acl.db.get_workspace",
            AsyncMock(return_value=type("W", (), {"ownerId": TENANT})()),
        ):
            assert await _is_event_visible(_k8s_event(workspace_id="ws-a"), TENANT) is True

    async def test_other_tenant_does_not(self) -> None:
        with patch(
            "aerospike_cluster_manager_api.workspace_acl.db.get_workspace",
            AsyncMock(return_value=type("W", (), {"ownerId": "user-tenant-b"})()),
        ):
            assert await _is_event_visible(_k8s_event(workspace_id="ws-b"), TENANT) is False

    async def test_system_owned_workspace_is_shared(self) -> None:
        with patch(
            "aerospike_cluster_manager_api.workspace_acl.db.get_workspace",
            AsyncMock(return_value=type("W", (), {"ownerId": SYSTEM_OWNER_ID})()),
        ):
            assert await _is_event_visible(_k8s_event(workspace_id="ws-default"), TENANT) is True

    async def test_deleted_workspace_is_invisible(self) -> None:
        with patch(
            "aerospike_cluster_manager_api.workspace_acl.db.get_workspace",
            AsyncMock(return_value=None),
        ):
            assert await _is_event_visible(_k8s_event(workspace_id="ws-gone"), TENANT) is False


class TestFailsClosed:
    async def test_unavailable_workspace_db_denies_delivery(self) -> None:
        """``strict=True`` on the SSE path.

        The REST gate degrades permissive on ``DBNotInitialized`` to keep
        legacy unit-test fixtures green. This channel has never had a filter,
        so there is no legacy behaviour to preserve and it fails closed.
        """
        from aerospike_cluster_manager_api import db

        with patch(
            "aerospike_cluster_manager_api.workspace_acl.db.get_workspace",
            AsyncMock(side_effect=db.DBNotInitialized("not initialised")),
        ):
            assert await _is_event_visible(_k8s_event(workspace_id="ws-a"), TENANT) is False

    async def test_event_published_without_attribution_is_denied(self) -> None:
        """A future publisher that forgets to stamp workspaceId fails safe."""
        event = _k8s_event()
        del event["workspaceId"]
        assert await _is_event_visible(event, TENANT) is False

    async def test_a_new_k8s_cluster_event_family_is_filtered_by_default(self) -> None:
        """Prefix matching, not an allowlist of known suffixes.

        A new ``k8s.cluster.<something>`` event is filtered the moment it
        exists, rather than shipping unfiltered until someone notices — which
        is how this bug arose.
        """
        assert await _is_event_visible(_k8s_event("somethingNew"), TENANT) is False


class TestNonK8sEventsAreUnchanged:
    @pytest.mark.parametrize("name", ["cluster.metrics", "connection.health", "message"])
    async def test_passed_through(self, name: str) -> None:
        # These are scoped by connection rather than workspace, and are gated
        # off by default via CM_SSE_BROADCAST_PER_CONNECTION for their own
        # tenant-isolation reason. Out of scope here — not silently "fixed".
        assert await _is_event_visible({"event": name, "data": {}}, TENANT) is True


class TestCollectorStampsAttribution:
    """The filter is only as good as the attribution it reads."""

    async def test_publishes_workspace_id_on_every_k8s_event(self) -> None:
        from aerospike_cluster_manager_api.events.collector import EventCollector

        cr = {
            "metadata": {
                "name": "demo",
                "namespace": "aerospike",
                "labels": {"acm.aerospike.com/workspace": "ws-a"},
            }
        }
        published: list[dict] = []

        with (
            patch("aerospike_cluster_manager_api.config.CM_SSE_BROADCAST_PER_CONNECTION", True),
            # subscriber_count is a read-only property on EventBroker, so
            # patch the underlying registry rather than the property.
            patch.dict(
                "aerospike_cluster_manager_api.events.collector.broker._subscribers",
                {"sub-1": (None, None)},
            ),
            patch(
                "aerospike_cluster_manager_api.events.collector.broker.publish",
                AsyncMock(side_effect=lambda e: published.append(e)),
            ),
            patch(
                "aerospike_cluster_manager_api.k8s_client.k8s_client.list_clusters",
                AsyncMock(return_value=([cr], None)),
            ),
            patch(
                "aerospike_cluster_manager_api.k8s_client.k8s_client.get_cluster",
                AsyncMock(return_value=cr),
            ),
            patch(
                "aerospike_cluster_manager_api.k8s_client.k8s_client.list_events",
                AsyncMock(return_value=[]),
            ),
        ):
            await EventCollector()._publish_k8s()

        assert published, "collector published nothing"
        kinds = {e["event"] for e in published}
        assert kinds == {"k8s.cluster.detail", "k8s.cluster.events", "k8s.cluster.health"}
        # Every one of them, not just the detail event that carries the CR.
        assert all(e.get("workspaceId") == "ws-a" for e in published), published

    async def test_workspace_id_never_reaches_the_wire(self) -> None:
        """It rides on the envelope, which the generator does not serialise."""
        import inspect

        from aerospike_cluster_manager_api.routers import events as events_mod

        source = inspect.getsource(events_mod._event_generator)
        yielded = source[source.index("yield {") :]
        assert "workspaceId" not in yielded

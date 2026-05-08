"""Tests for the note-injection helpers on the read path.

* ``services.clusters_service._attach_set_notes`` mutates the namespaces
  list in place to populate ``SetInfo.note``.
* ``routers.records._attach_record_notes`` does the same for record-list
  responses.
* Both swallow only ``db.DBNotInitialized`` (the dedicated sentinel) —
  any other exception must propagate.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.cluster import NamespaceInfo, SetInfo
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.services.clusters_service import _attach_set_notes

pytestmark = pytest.mark.asyncio


def _ns_with_sets(name: str, sets: list[str]) -> NamespaceInfo:
    return NamespaceInfo(
        name=name,
        objects=0,
        memoryUsed=0,
        memoryTotal=0,
        memoryFreePct=0,
        deviceUsed=0,
        deviceTotal=0,
        replicationFactor=1,
        stopWrites=False,
        hwmBreached=False,
        highWaterMemoryPct=0,
        highWaterDiskPct=0,
        sets=[
            SetInfo(
                name=s,
                namespace=name,
                objects=0,
                tombstones=0,
                memoryDataBytes=0,
                stopWritesCount=0,
            )
            for s in sets
        ],
    )


async def _seed(conn_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    await db.create_connection(
        ConnectionProfile(
            id=conn_id,
            name="t",
            hosts=["localhost"],
            port=3000,
            color="#0097D3",
            createdAt=now,
            updatedAt=now,
        )
    )


class TestAttachSetNotes:
    async def test_populates_note_when_metadb_has_a_match(self, init_test_db) -> None:
        await _seed("conn-attach-1")
        await db.upsert_set_note("conn-attach-1", "test", "demo", "set-level-memo", None)

        namespaces = [_ns_with_sets("test", ["demo", "other"])]
        await _attach_set_notes("conn-attach-1", namespaces)
        notes_by_set = {s.name: s.note for s in namespaces[0].sets}
        # The matched set carries the note; the unmatched set stays None.
        assert notes_by_set == {"demo": "set-level-memo", "other": None}

    async def test_no_op_when_metadb_returns_empty(self, init_test_db) -> None:
        await _seed("conn-attach-2")
        namespaces = [_ns_with_sets("test", ["demo"])]
        # No notes seeded — the helper exits early in the inner ``if not
        # notes: continue`` branch and leaves the SetInfo unchanged.
        await _attach_set_notes("conn-attach-2", namespaces)
        assert namespaces[0].sets[0].note is None

    async def test_swallows_dbnotinitialized_only(self) -> None:
        # No init_test_db fixture — _backend is None, so the helper hits
        # DBNotInitialized inside batch_get_set_notes and returns silently.
        # A passing test here proves the catch is exercised in the unit
        # path; an unrelated regression would surface as either a real
        # exception bubbling up or a silent crash on a None backend.
        assert db._backend is None
        namespaces = [_ns_with_sets("test", ["demo"])]
        await _attach_set_notes("conn-no-db", namespaces)
        # Untouched — no notes attached, no exception raised.
        assert namespaces[0].sets[0].note is None

    async def test_propagates_unrelated_runtimeerror(self, init_test_db) -> None:
        # Anything that isn't ``DBNotInitialized`` must NOT be silently
        # swallowed. Patch the dispatch to raise a plain RuntimeError and
        # verify the helper re-raises.
        await _seed("conn-attach-3")
        namespaces = [_ns_with_sets("test", ["demo"])]

        async def boom(*args, **kwargs):
            raise RuntimeError("simulated unrelated failure")

        with (
            patch.object(db, "batch_get_set_notes", boom),
            pytest.raises(RuntimeError, match="simulated unrelated failure"),
        ):
            await _attach_set_notes("conn-attach-3", namespaces)

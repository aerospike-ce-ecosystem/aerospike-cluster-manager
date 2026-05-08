"""Round-trip + cascade + (pk_text, pk_type) distinctness tests for the
SQLite notes layer.

Pulls in the ``init_test_db`` fixture from ``conftest`` which spins up a
fresh SQLite file under ``tmp_path``. Postgres parity is verified by
matching docstrings on the Postgres-backed methods; the SQL surface is
small enough that backend drift would surface as a diff in a follow-up
review rather than a runtime regression.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from aerospike_cluster_manager_api import db
from aerospike_cluster_manager_api.models.connection import ConnectionProfile

pytestmark = pytest.mark.asyncio


async def _seed_connection(conn_id: str = "conn-notes-1") -> ConnectionProfile:
    now = datetime.now(UTC).isoformat()
    profile = ConnectionProfile(
        id=conn_id,
        name="Notes test",
        hosts=["localhost"],
        port=3000,
        color="#0097D3",
        createdAt=now,
        updatedAt=now,
    )
    await db.create_connection(profile)
    return profile


# ---------------------------------------------------------------------------
# Set notes round-trip
# ---------------------------------------------------------------------------


class TestSetNotesRoundTrip:
    async def test_upsert_returns_persisted_row(self, init_test_db) -> None:
        await _seed_connection("conn-set-1")
        saved = await db.upsert_set_note("conn-set-1", "test", "demo", "first", "alice")
        assert saved.connectionId == "conn-set-1"
        assert saved.namespace == "test"
        assert saved.setName == "demo"
        assert saved.note == "first"
        assert saved.updatedBy == "alice"
        assert saved.createdAt == saved.updatedAt

    async def test_upsert_updates_existing_row_preserves_created_at(self, init_test_db) -> None:
        await _seed_connection("conn-set-2")
        first = await db.upsert_set_note("conn-set-2", "test", "demo", "first", "alice")
        # Bump the wall clock by sleeping is unreliable; instead rely on
        # iso strings being lexicographic and re-upsert immediately. The
        # invariant we care about is that ``createdAt`` stays pinned.
        second = await db.upsert_set_note("conn-set-2", "test", "demo", "second", "bob")
        assert second.createdAt == first.createdAt
        assert second.note == "second"
        assert second.updatedBy == "bob"

    async def test_delete_returns_true_when_row_existed(self, init_test_db) -> None:
        await _seed_connection("conn-set-3")
        await db.upsert_set_note("conn-set-3", "test", "demo", "x", None)
        assert await db.delete_set_note("conn-set-3", "test", "demo") is True
        assert await db.get_set_note("conn-set-3", "test", "demo") is None

    async def test_delete_returns_false_when_no_row(self, init_test_db) -> None:
        await _seed_connection("conn-set-4")
        assert await db.delete_set_note("conn-set-4", "test", "missing") is False

    async def test_list_filters_by_namespace(self, init_test_db) -> None:
        await _seed_connection("conn-set-5")
        await db.upsert_set_note("conn-set-5", "test", "a", "ta", None)
        await db.upsert_set_note("conn-set-5", "test", "b", "tb", None)
        await db.upsert_set_note("conn-set-5", "other", "a", "oa", None)
        in_test = await db.list_set_notes("conn-set-5", "test")
        in_other = await db.list_set_notes("conn-set-5", "other")
        all_ = await db.list_set_notes("conn-set-5")
        assert {n.setName for n in in_test} == {"a", "b"}
        assert {n.setName for n in in_other} == {"a"}
        assert len(all_) == 3

    async def test_batch_get_set_notes_empty_input_no_db_call(self, init_test_db) -> None:
        # Empty input must short-circuit to an empty dict; an unguarded
        # implementation would generate ``IN ()`` and fail.
        result = await db.batch_get_set_notes("conn-x", "test", [])
        assert result == {}

    async def test_batch_get_set_notes_returns_only_requested(self, init_test_db) -> None:
        await _seed_connection("conn-set-6")
        await db.upsert_set_note("conn-set-6", "test", "a", "ta", None)
        await db.upsert_set_note("conn-set-6", "test", "b", "tb", None)
        result = await db.batch_get_set_notes("conn-set-6", "test", ["a", "missing"])
        assert result == {"a": "ta"}


# ---------------------------------------------------------------------------
# Record notes — pk_text/pk_type distinctness + round-trip
# ---------------------------------------------------------------------------


class TestRecordNotesRoundTrip:
    async def test_pk_string_and_pk_int_with_same_text_coexist(self, init_test_db) -> None:
        # The PK includes both pk_text and pk_type because Aerospike keys
        # ``"42":string`` and ``"42":int`` digest differently — operators
        # must be able to annotate both independently.
        await _seed_connection("conn-rec-1")
        as_string = await db.upsert_record_note("conn-rec-1", "test", "demo", "42", "string", "string-note", None, None)
        as_int = await db.upsert_record_note("conn-rec-1", "test", "demo", "42", "int", "int-note", None, None)
        assert as_string.note == "string-note"
        assert as_int.note == "int-note"

        listed = await db.list_record_notes("conn-rec-1", "test", "demo")
        notes_by_type = {(r.pkText, r.pkType): r.note for r in listed}
        assert notes_by_type == {("42", "string"): "string-note", ("42", "int"): "int-note"}

    async def test_delete_targets_pk_type(self, init_test_db) -> None:
        await _seed_connection("conn-rec-2")
        await db.upsert_record_note("conn-rec-2", "test", "demo", "42", "string", "s", None, None)
        await db.upsert_record_note("conn-rec-2", "test", "demo", "42", "int", "i", None, None)

        assert await db.delete_record_note("conn-rec-2", "test", "demo", "42", "string") is True
        # The string row is gone but the int row remains.
        assert await db.get_record_note("conn-rec-2", "test", "demo", "42", "string") is None
        assert (await db.get_record_note("conn-rec-2", "test", "demo", "42", "int")).note == "i"

    async def test_batch_get_record_notes_empty_input(self, init_test_db) -> None:
        assert await db.batch_get_record_notes("conn-x", "test", "demo", []) == {}

    async def test_batch_get_record_notes_keyed_by_pair(self, init_test_db) -> None:
        await _seed_connection("conn-rec-3")
        await db.upsert_record_note("conn-rec-3", "test", "demo", "42", "string", "a", None, None)
        await db.upsert_record_note("conn-rec-3", "test", "demo", "42", "int", "b", None, None)
        await db.upsert_record_note("conn-rec-3", "test", "demo", "99", "string", "c", None, None)

        result = await db.batch_get_record_notes(
            "conn-rec-3",
            "test",
            "demo",
            [("42", "string"), ("42", "int"), ("missing", "string")],
        )
        assert result == {("42", "string"): "a", ("42", "int"): "b"}


# ---------------------------------------------------------------------------
# Cascade — connection delete must wipe its notes (FK ON DELETE CASCADE)
# ---------------------------------------------------------------------------


class TestNotesCascade:
    async def test_connection_delete_cascades_set_notes(self, init_test_db) -> None:
        await _seed_connection("conn-cascade-1")
        await db.upsert_set_note("conn-cascade-1", "test", "demo", "n", None)
        assert (await db.list_set_notes("conn-cascade-1")) != []

        await db.delete_connection("conn-cascade-1")
        assert await db.list_set_notes("conn-cascade-1") == []

    async def test_connection_delete_cascades_record_notes(self, init_test_db) -> None:
        await _seed_connection("conn-cascade-2")
        await db.upsert_record_note("conn-cascade-2", "test", "demo", "k", "string", "n", None, None)
        assert (await db.list_record_notes("conn-cascade-2", "test", "demo")) != []

        await db.delete_connection("conn-cascade-2")
        assert await db.list_record_notes("conn-cascade-2", "test", "demo") == []

    async def test_other_connections_notes_untouched(self, init_test_db) -> None:
        await _seed_connection("conn-cascade-3")
        await _seed_connection("conn-cascade-4")
        await db.upsert_set_note("conn-cascade-3", "test", "a", "x", None)
        await db.upsert_set_note("conn-cascade-4", "test", "a", "y", None)

        await db.delete_connection("conn-cascade-3")
        # conn-cascade-4's note must survive.
        assert (await db.get_set_note("conn-cascade-4", "test", "a")).note == "y"


# ---------------------------------------------------------------------------
# DBNotInitialized sentinel
# ---------------------------------------------------------------------------


class TestDBNotInitialized:
    async def test_get_backend_raises_subclass_of_runtimeerror(self) -> None:
        # Importing here so the test isolates the not-yet-initialised path
        # without sharing state with init_test_db tests in the same module.
        from aerospike_cluster_manager_api import db as db_mod

        # Ensure the DB is uninitialised in this test (test_db.py and
        # test_notes_db.py never share state because pytest fixtures scope
        # by function and ``init_test_db`` calls ``close_db`` on teardown).
        assert db_mod._backend is None
        with pytest.raises(db_mod.DBNotInitialized):
            await db_mod.batch_get_set_notes("conn-x", "test", ["a"])

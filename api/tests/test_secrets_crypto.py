"""Unit tests for :mod:`aerospike_cluster_manager_api.secrets_crypto`.

Covers KEK provisioning policy (env-required, ephemeral opt-in),
``enc:v1:`` ciphertext shape, migration round-trip via the SQLite backend,
and KEK-mismatch failure surface.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

from aerospike_cluster_manager_api import db, secrets_crypto
from aerospike_cluster_manager_api.models.connection import ConnectionProfile


@pytest.fixture(autouse=True)
def _restore_secrets_state():
    """Reset the crypto singleton around each test so env mutations
    in one test never leak into another."""
    yield
    secrets_crypto.reset_for_tests()


def test_encrypt_round_trip():
    plaintext = "supersecret-aerospike-password"
    blob = secrets_crypto.encrypt_password(plaintext)
    assert blob.startswith("enc:v1:"), blob
    assert plaintext not in blob, "plaintext leaked into ciphertext envelope"
    assert secrets_crypto.decrypt_password(blob) == plaintext


def test_empty_password_passes_through():
    assert secrets_crypto.encrypt_password("") == ""
    assert secrets_crypto.decrypt_password(None) is None
    assert secrets_crypto.decrypt_password("") == ""


def test_legacy_plaintext_round_trip():
    """A row written before the migration (no ``enc:v1:`` prefix) must be
    returned verbatim — that's the migration-compat read path."""
    assert secrets_crypto.decrypt_password("plain-old-password") == "plain-old-password"
    assert secrets_crypto.is_encrypted("plain-old-password") is False
    assert secrets_crypto.is_encrypted(secrets_crypto.encrypt_password("x")) is True


def test_missing_kek_without_opt_in_raises(monkeypatch):
    monkeypatch.delenv("ACM_PASSWORD_KEK", raising=False)
    monkeypatch.delenv("ACM_ALLOW_EPHEMERAL_KEK", raising=False)
    secrets_crypto.reset_for_tests()
    with pytest.raises(RuntimeError) as excinfo:
        secrets_crypto.encrypt_password("anything")
    msg = str(excinfo.value)
    assert "ACM_PASSWORD_KEK" in msg
    assert "Fernet.generate_key" in msg


def test_missing_kek_with_ephemeral_opt_in_emits_warning(monkeypatch):
    """Loud warning must fire so this never gets quietly tolerated in prod.

    The package logger has ``propagate=False`` set by ``setup_logging`` at
    import time, so pytest's ``caplog`` fixture (which attaches to the
    root logger) doesn't see the record. Attach a temporary handler
    directly to the target logger instead.
    """
    import io
    import logging as _logging

    monkeypatch.delenv("ACM_PASSWORD_KEK", raising=False)
    monkeypatch.setenv("ACM_ALLOW_EPHEMERAL_KEK", "true")
    secrets_crypto.reset_for_tests()

    buf = io.StringIO()
    handler = _logging.StreamHandler(buf)
    handler.setLevel(_logging.WARNING)
    handler.setFormatter(_logging.Formatter("%(levelname)s %(message)s"))
    target = _logging.getLogger("aerospike_cluster_manager_api.secrets_crypto")
    target.addHandler(handler)
    try:
        blob = secrets_crypto.encrypt_password("hello")
    finally:
        target.removeHandler(handler)

    assert blob.startswith("enc:v1:")
    assert secrets_crypto.is_ephemeral() is True
    output = buf.getvalue()
    assert "ephemeral key" in output.lower(), output


def test_invalid_kek_raises_with_remediation(monkeypatch):
    monkeypatch.setenv("ACM_PASSWORD_KEK", "not-a-fernet-key")
    secrets_crypto.reset_for_tests()
    with pytest.raises(RuntimeError) as excinfo:
        secrets_crypto.encrypt_password("anything")
    msg = str(excinfo.value)
    assert "Fernet.generate_key" in msg


def test_kek_mismatch_on_decrypt(monkeypatch):
    """A row encrypted under KEK A must fail loudly when read under KEK B
    rather than silently returning corrupted plaintext."""
    monkeypatch.setenv("ACM_PASSWORD_KEK", Fernet.generate_key().decode("ascii"))
    secrets_crypto.reset_for_tests()
    blob = secrets_crypto.encrypt_password("rotation-test")
    monkeypatch.setenv("ACM_PASSWORD_KEK", Fernet.generate_key().decode("ascii"))
    secrets_crypto.reset_for_tests()
    with pytest.raises(RuntimeError) as excinfo:
        secrets_crypto.decrypt_password(blob)
    assert "KEK mismatch" in str(excinfo.value)


# ---------------------------------------------------------------------------
# DB-layer integration — verify ciphertext lands on disk and is decrypted
# transparently on read.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_persisted_as_ciphertext(tmp_path):
    """The raw ``connections.password`` column must contain the ``enc:v1:``
    envelope, never plaintext, after a successful create."""
    db_path = str(tmp_path / "encrypt_test.db")
    with (
        patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
        patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
    ):
        await db.init_db()
        try:
            now = datetime.now(UTC).isoformat()
            conn = ConnectionProfile(
                id="conn-encrypted",
                name="encrypted",
                hosts=["localhost"],
                port=3000,
                username="admin",
                password="hunter2",
                color="#0097D3",
                createdAt=now,
                updatedAt=now,
            )
            await db.create_connection(conn)

            # Round-trip through the public API decrypts.
            retrieved = await db.get_connection("conn-encrypted")
            assert retrieved is not None
            assert retrieved.password == "hunter2"

            # On-disk shape: the raw column must be ciphertext, not plaintext.
            import aiosqlite

            async with (
                aiosqlite.connect(db_path) as raw,
                raw.execute("SELECT password FROM connections WHERE id = ?", ("conn-encrypted",)) as cursor,
            ):
                row = await cursor.fetchone()
            assert row is not None
            stored = row[0]
            assert stored.startswith("enc:v1:")
            assert "hunter2" not in stored
        finally:
            await db.close_db()


@pytest.mark.asyncio
async def test_legacy_plaintext_row_migrated_on_init(tmp_path):
    """A connection row written with a plaintext password must be rewritten
    in-place on the next ``init_db()`` call. Idempotent: a second init
    must not double-encrypt or otherwise corrupt the row."""
    import aiosqlite

    db_path = str(tmp_path / "legacy.db")
    # Hand-write a legacy row, bypassing the encryption layer.
    async with aiosqlite.connect(db_path) as raw:
        await raw.execute(
            """CREATE TABLE connections (
                id TEXT PRIMARY KEY, name TEXT, hosts TEXT, port INTEGER,
                cluster_name TEXT, username TEXT, password TEXT,
                color TEXT, note TEXT, labels TEXT, workspace_id TEXT,
                created_at TEXT, updated_at TEXT
            )"""
        )
        now = datetime.now(UTC).isoformat()
        await raw.execute(
            """INSERT INTO connections (id, name, hosts, port, color, password,
                                        created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                "conn-legacy",
                "legacy",
                '["localhost"]',
                3000,
                "#0097D3",
                "legacy-plain-pw",
                now,
                now,
            ),
        )
        await raw.commit()

    with (
        patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
        patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
    ):
        await db.init_db()
        try:
            retrieved = await db.get_connection("conn-legacy")
            assert retrieved is not None
            assert retrieved.password == "legacy-plain-pw"

            # The on-disk column should now be ciphertext.
            async with (
                aiosqlite.connect(db_path) as raw,
                raw.execute("SELECT password FROM connections WHERE id = ?", ("conn-legacy",)) as cursor,
            ):
                row = await cursor.fetchone()
            assert row is not None
            assert row[0].startswith("enc:v1:")
            first_blob = row[0]
        finally:
            await db.close_db()

    # Re-init: idempotent. Same blob must remain (we don't re-encrypt
    # already-versioned rows, otherwise a process bouncing in a loop
    # would burn through Fernet's 64-byte nonce space for no benefit).
    with (
        patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
        patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
    ):
        await db.init_db()
        try:
            async with (
                aiosqlite.connect(db_path) as raw,
                raw.execute("SELECT password FROM connections WHERE id = ?", ("conn-legacy",)) as cursor,
            ):
                row = await cursor.fetchone()
            assert row is not None
            assert row[0] == first_blob
        finally:
            await db.close_db()


@pytest.mark.asyncio
async def test_init_db_succeeds_in_ephemeral_mode_without_explicit_kek(tmp_path, monkeypatch):
    """When ACM_PASSWORD_KEK is unset and ACM_ALLOW_EPHEMERAL_KEK=true, the
    API must still come up. The encryption migration runs against an
    ephemeral key — legacy rows get rewritten and become unreadable on
    the next restart, which is the documented dev-mode trade-off."""
    monkeypatch.delenv("ACM_PASSWORD_KEK", raising=False)
    monkeypatch.setenv("ACM_ALLOW_EPHEMERAL_KEK", "true")
    secrets_crypto.reset_for_tests()

    db_path = str(tmp_path / "ephemeral.db")
    with (
        patch("aerospike_cluster_manager_api.config.ENABLE_POSTGRES", False),
        patch("aerospike_cluster_manager_api.config.SQLITE_PATH", db_path),
    ):
        await db.init_db()
        try:
            # Sanity: round-trip a brand-new row.
            now = datetime.now(UTC).isoformat()
            await db.create_connection(
                ConnectionProfile(
                    id="conn-ephemeral",
                    name="eph",
                    hosts=["localhost"],
                    port=3000,
                    password="ephemeral-pw",
                    color="#0097D3",
                    createdAt=now,
                    updatedAt=now,
                )
            )
            got = await db.get_connection("conn-ephemeral")
            assert got is not None
            assert got.password == "ephemeral-pw"
        finally:
            await db.close_db()

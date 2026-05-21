"""PostgreSQL persistence layer for connection profiles.

Uses asyncpg with a connection pool for fully async database access.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import asyncpg

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.db._base import (
    build_merged_profile,
    build_merged_workspace,
    row_to_guide,
    row_to_profile,
    row_to_workspace,
)
from aerospike_cluster_manager_api.models.connection import ConnectionProfile
from aerospike_cluster_manager_api.models.guide import Guide
from aerospike_cluster_manager_api.models.note import RecordNote, SetNote, StoredPkType
from aerospike_cluster_manager_api.models.workspace import (
    DEFAULT_WORKSPACE_ID,
    SYSTEM_OWNER_ID,
    Workspace,
)
from aerospike_cluster_manager_api.secrets_crypto import (
    decrypt_password,
    encrypt_password,
    is_encrypted,
)

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    hosts        JSONB NOT NULL,
    port         INTEGER NOT NULL DEFAULT 3000,
    cluster_name TEXT,
    username     TEXT,
    password     TEXT,
    color        TEXT NOT NULL DEFAULT '#0097D3',
    note         TEXT,
    labels       JSONB,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
"""

CREATE_WORKSPACES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366F1',
    description TEXT,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id    TEXT NOT NULL DEFAULT 'system',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""

# Mirrors SQLite layout — see _sqlite.py for the design rationale on PK shape
# and digest_hex semantics. PG enforces FK CASCADE natively.
CREATE_SET_NOTES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS set_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    note          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    PRIMARY KEY (connection_id, namespace, set_name),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
"""

CREATE_SET_NOTES_INDEX_SQL = "CREATE INDEX IF NOT EXISTS idx_set_notes_conn_ns ON set_notes(connection_id, namespace);"

CREATE_RECORD_NOTES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS record_notes (
    connection_id TEXT NOT NULL,
    namespace     TEXT NOT NULL,
    set_name      TEXT NOT NULL,
    pk_text       TEXT NOT NULL,
    pk_type       TEXT NOT NULL DEFAULT 'string',
    digest_hex    TEXT,
    note          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    PRIMARY KEY (connection_id, namespace, set_name, pk_text, pk_type),
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);
"""

CREATE_RECORD_NOTES_INDEX_SQL = (
    "CREATE INDEX IF NOT EXISTS idx_record_notes_conn_ns_set ON record_notes(connection_id, namespace, set_name);"
)

# Operational guides — see _sqlite.py for the design rationale on the
# composite (workspace_id, guide_type) PK. PG enforces FK CASCADE natively.
CREATE_GUIDES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS guides (
    workspace_id TEXT NOT NULL,
    guide_type   TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    updated_by   TEXT,
    PRIMARY KEY (workspace_id, guide_type),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
"""


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        from aerospike_cluster_manager_api.db import DBNotInitialized

        raise DBNotInitialized("Database not initialized. Call init_db() first.")
    return _pool


# Advisory-lock key for the migration block. Picked at random and pinned
# here so every replica negotiates the same lock — collisions with other
# advisory locks in this DB are vanishingly unlikely. A 64-bit signed int
# fits in a single bigint argument to ``pg_advisory_lock``.
_MIGRATION_ADVISORY_LOCK_KEY = 0x4143_4D5F_4E4F_5445  # "ACM_NOTE"


async def _apply_migrations(conn: asyncpg.Connection | asyncpg.pool.PoolConnectionProxy) -> None:
    """Add columns introduced after the initial schema.

    Wrapped in a session-level advisory lock so concurrent startups
    (rolling deploys with multiple replicas) serialise on the same DDL
    block. Without the lock, two replicas can both observe
    ``description column exists, note doesn't`` from
    ``information_schema``, race to ``RENAME COLUMN``, and crash the
    second one with ``UndefinedColumnError``. The lock is released
    automatically when the session ends or on explicit ``pg_advisory_unlock``.

    Uses ``ADD COLUMN IF NOT EXISTS`` for the rest so the column-add
    branches stay idempotent even if the lock contended.
    """
    await conn.execute("SELECT pg_advisory_lock($1)", _MIGRATION_ADVISORY_LOCK_KEY)
    try:
        # description -> note rename. Idempotent across DB ages by inspecting
        # information_schema before each branch:
        #   * fresh DB (CREATE TABLE has note already): both branches skip
        #   * legacy DB with description: RENAME description -> note (atomic)
        #   * pathological: both columns coexist -> copy then drop description
        desc_exists = await conn.fetchval(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'description'"
        )
        note_exists = await conn.fetchval(
            "SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'note'"
        )
        if desc_exists and not note_exists:
            await conn.execute("ALTER TABLE connections RENAME COLUMN description TO note")
        elif desc_exists and note_exists:
            # Both columns shouldn't coexist in a healthy deployment — only
            # an aborted prior migration leaves this state. Surface the
            # data-loss surface area at WARN before we drop ``description``
            # so an operator at least sees how many distinct values were
            # discarded.
            divergent = await conn.fetchval(
                """SELECT COUNT(*) FROM connections
                       WHERE description IS NOT NULL
                         AND (note IS NULL OR description <> note)"""
            )
            if divergent and divergent > 0:
                logger.warning(
                    "Dropping 'description' column with %d divergent value(s) "
                    "(note IS NULL or note <> description). "
                    "Run a manual reconciliation before redeploying if this is unexpected.",
                    divergent,
                )
            await conn.execute("UPDATE connections SET note = description WHERE note IS NULL")
            await conn.execute("ALTER TABLE connections DROP COLUMN description")
        elif not desc_exists and not note_exists:
            await conn.execute("ALTER TABLE connections ADD COLUMN note TEXT")

        await conn.execute("ALTER TABLE connections ADD COLUMN IF NOT EXISTS labels JSONB")
        await conn.execute("ALTER TABLE connections ADD COLUMN IF NOT EXISTS workspace_id TEXT")
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _MIGRATION_ADVISORY_LOCK_KEY)

    # workspaces.owner_id (issue #307 — Phase 0b). On PG the
    # ``IF NOT EXISTS`` clause makes the migration idempotent and
    # metadata-only on PG ≥ 11 (no full table rewrite). Existing rows
    # backfill via the column ``DEFAULT 'system'``; the workspace ACL
    # treats that sentinel as accessible to any authenticated caller
    # (legacy single-tenant semantics).
    await conn.execute("ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'system'")

    # Seed the built-in default workspace and back-fill any pre-existing
    # connections. Idempotent: ON CONFLICT DO NOTHING / WHERE workspace_id IS NULL.
    now = datetime.now(UTC).isoformat()
    await conn.execute(
        """INSERT INTO workspaces
               (id, name, color, description, is_default, owner_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING""",
        DEFAULT_WORKSPACE_ID,
        "Default",
        "#6366F1",
        "Default workspace",
        SYSTEM_OWNER_ID,
        now,
        now,
    )
    await conn.execute(
        "UPDATE connections SET workspace_id = $1 WHERE workspace_id IS NULL",
        DEFAULT_WORKSPACE_ID,
    )


async def init_db() -> None:
    global _pool
    logger.info("Connecting to PostgreSQL …")
    old_pool = _pool
    pool = await asyncpg.create_pool(
        config.DATABASE_URL,
        min_size=config.DB_POOL_MIN_SIZE,
        max_size=config.DB_POOL_MAX_SIZE,
        command_timeout=config.DB_COMMAND_TIMEOUT,
    )
    try:
        async with pool.acquire() as conn:
            await conn.execute(CREATE_TABLE_SQL)
            await conn.execute(CREATE_WORKSPACES_TABLE_SQL)
            await conn.execute(CREATE_SET_NOTES_TABLE_SQL)
            await conn.execute(CREATE_SET_NOTES_INDEX_SQL)
            await conn.execute(CREATE_RECORD_NOTES_TABLE_SQL)
            await conn.execute(CREATE_RECORD_NOTES_INDEX_SQL)
            await conn.execute(CREATE_GUIDES_TABLE_SQL)
            await _apply_migrations(conn)
        _pool = pool
    except Exception:
        _pool = old_pool
        await pool.close()
        raise
    logger.info("Database initialized")


async def check_health() -> bool:
    """Check database connectivity. Returns True if healthy."""
    try:
        pool = _get_pool()
        await pool.fetchval("SELECT 1")
        return True
    except Exception:
        return False


async def migrate_passwords_to_encrypted() -> int:
    """Rewrite any plaintext (``enc:v1:``-prefix-missing) password rows.

    Idempotent. Mirrors :func:`db._sqlite.migrate_passwords_to_encrypted`.
    Wrapped in a transaction so concurrent replicas serialise on each row;
    the WHERE-clause shape is the canonical pattern for "rewrite if not
    yet versioned" in this codebase.
    """
    pool = _get_pool()
    rewritten = 0
    async with pool.acquire() as conn, conn.transaction():
        rows = await conn.fetch("SELECT id, password FROM connections")
        for row in rows:
            password = row["password"]
            if password is None or password == "":
                continue
            if is_encrypted(password):
                continue
            encrypted = encrypt_password(password)
            await conn.execute(
                "UPDATE connections SET password = $1 WHERE id = $2",
                encrypted,
                row["id"],
            )
            rewritten += 1
    if rewritten:
        logger.info("Encrypted %d legacy plaintext password row(s) in PostgreSQL.", rewritten)
    return rewritten


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ---------------------------------------------------------------------------
# Row -> Model helper (delegated to _base.py)
# ---------------------------------------------------------------------------


def _row_to_profile(row: asyncpg.Record) -> ConnectionProfile:
    """Wrap :func:`row_to_profile` to decrypt the password column on read.

    Mirrors the SQLite backend so the encryption layer is transparent to
    downstream consumers regardless of which DB is configured.
    """
    profile = row_to_profile(row)
    if profile.password:
        profile = profile.model_copy(update={"password": decrypt_password(profile.password)})
    return profile


_row_to_workspace = row_to_workspace


# ---------------------------------------------------------------------------
# Async public API — connections
# ---------------------------------------------------------------------------


async def get_all_connections(workspace_id: str | None = None) -> list[ConnectionProfile]:
    pool = _get_pool()
    if workspace_id is not None:
        rows = await pool.fetch(
            "SELECT * FROM connections WHERE workspace_id = $1 ORDER BY created_at",
            workspace_id,
        )
    else:
        rows = await pool.fetch("SELECT * FROM connections ORDER BY created_at")
    return [_row_to_profile(row) for row in rows]


async def get_connection(conn_id: str) -> ConnectionProfile | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM connections WHERE id = $1", conn_id)
    return _row_to_profile(row) if row else None


async def create_connection(conn: ConnectionProfile) -> None:
    pool = _get_pool()
    # Encrypt the password column before it touches the database. Empty
    # / None passwords (anonymous binds) round-trip unchanged.
    stored_password = encrypt_password(conn.password) if conn.password else conn.password
    await pool.execute(
        """INSERT INTO connections (id, name, hosts, port, cluster_name, username, password,
                                    color, note, labels, workspace_id, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)""",
        conn.id,
        conn.name,
        json.dumps(conn.hosts),
        conn.port,
        conn.clusterName,
        conn.username,
        stored_password,
        conn.color,
        conn.note,
        json.dumps(conn.labels),
        conn.workspaceId,
        conn.createdAt,
        conn.updatedAt,
    )


async def update_connection(conn_id: str, data: dict) -> ConnectionProfile | None:
    pool = _get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM connections WHERE id = $1 FOR UPDATE", conn_id)
        if not row:
            return None

        existing = _row_to_profile(row)
        updated = build_merged_profile(existing, data, conn_id)

        # Re-encrypt the merged password before storing. ``existing.password``
        # was decrypted by ``_row_to_profile``, so the merged result is
        # plaintext regardless of whether the caller supplied a new
        # password — we always encrypt on write.
        stored_password = encrypt_password(updated.password) if updated.password else updated.password
        await conn.execute(
            """UPDATE connections
                   SET name = $1, hosts = $2::jsonb, port = $3, cluster_name = $4,
                       username = $5, password = $6, color = $7,
                       note = $8, labels = $9::jsonb, workspace_id = $10,
                       updated_at = $11
                   WHERE id = $12""",
            updated.name,
            json.dumps(updated.hosts),
            updated.port,
            updated.clusterName,
            updated.username,
            stored_password,
            updated.color,
            updated.note,
            json.dumps(updated.labels),
            updated.workspaceId,
            updated.updatedAt,
            conn_id,
        )
        return updated


async def delete_connection(conn_id: str) -> bool:
    pool = _get_pool()
    result = await pool.execute("DELETE FROM connections WHERE id = $1", conn_id)
    return result == "DELETE 1"


# ---------------------------------------------------------------------------
# Async public API — workspaces
# ---------------------------------------------------------------------------


async def get_all_workspaces() -> list[Workspace]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM workspaces ORDER BY is_default DESC, created_at")
    return [_row_to_workspace(row) for row in rows]


async def get_workspace(workspace_id: str) -> Workspace | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)
    return _row_to_workspace(row) if row else None


async def get_workspaces_owned_by(owner_id: str) -> list[Workspace]:
    """Return workspaces visible to ``owner_id``.

    Visibility = ``ownerId == owner_id`` OR ``ownerId == 'system'``. The
    second leg keeps the built-in default and any pre-migration rows
    accessible to every authenticated caller, matching the ACL contract
    in the ownership ADR.
    """
    pool = _get_pool()
    rows = await pool.fetch(
        """SELECT * FROM workspaces
               WHERE owner_id = $1 OR owner_id = $2
               ORDER BY is_default DESC, created_at""",
        owner_id,
        SYSTEM_OWNER_ID,
    )
    return [_row_to_workspace(row) for row in rows]


async def create_workspace(ws: Workspace) -> None:
    pool = _get_pool()
    await pool.execute(
        """INSERT INTO workspaces
               (id, name, color, description, is_default, owner_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
        ws.id,
        ws.name,
        ws.color,
        ws.description,
        ws.isDefault,
        ws.ownerId,
        ws.createdAt,
        ws.updatedAt,
    )


async def update_workspace(workspace_id: str, data: dict) -> Workspace | None:
    pool = _get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1 FOR UPDATE", workspace_id)
        if not row:
            return None

        existing = _row_to_workspace(row)
        updated = build_merged_workspace(existing, data)

        await conn.execute(
            """UPDATE workspaces
                   SET name = $1, color = $2, description = $3, updated_at = $4
                   WHERE id = $5""",
            updated.name,
            updated.color,
            updated.description,
            updated.updatedAt,
            workspace_id,
        )
        return updated


async def delete_workspace(workspace_id: str) -> bool:
    """Delete a workspace by id, refusing to delete the built-in default.

    The ``is_default = FALSE`` clause is defense-in-depth: the router already
    rejects deletes of the default workspace with HTTP 400, but enforcing
    it at the DB layer guarantees the invariant holds even if a future
    caller bypasses the router (refactor, internal task, direct tests).
    """
    pool = _get_pool()
    result = await pool.execute(
        "DELETE FROM workspaces WHERE id = $1 AND is_default = FALSE",
        workspace_id,
    )
    return result == "DELETE 1"


async def count_connections_in_workspace(workspace_id: str) -> int:
    pool = _get_pool()
    val = await pool.fetchval("SELECT COUNT(*) FROM connections WHERE workspace_id = $1", workspace_id)
    return int(val) if val is not None else 0


# ---------------------------------------------------------------------------
# Async public API — set notes
# ---------------------------------------------------------------------------


def _row_to_set_note(row: asyncpg.Record) -> SetNote:
    return SetNote(
        connectionId=row["connection_id"],
        namespace=row["namespace"],
        setName=row["set_name"],
        note=row["note"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        updatedBy=row["updated_by"],
    )


async def upsert_set_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    note: str,
    updated_by: str | None,
) -> SetNote:
    pool = _get_pool()
    now = datetime.now(UTC).isoformat()
    row = await pool.fetchrow(
        """INSERT INTO set_notes (connection_id, namespace, set_name, note,
                                  created_at, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (connection_id, namespace, set_name) DO UPDATE SET
               note = EXCLUDED.note,
               updated_at = EXCLUDED.updated_at,
               updated_by = EXCLUDED.updated_by
           RETURNING *""",
        connection_id,
        namespace,
        set_name,
        note,
        now,
        now,
        updated_by,
    )
    return _row_to_set_note(row)


async def delete_set_note(connection_id: str, namespace: str, set_name: str) -> bool:
    pool = _get_pool()
    result = await pool.execute(
        "DELETE FROM set_notes WHERE connection_id = $1 AND namespace = $2 AND set_name = $3",
        connection_id,
        namespace,
        set_name,
    )
    return result == "DELETE 1"


async def get_set_note(connection_id: str, namespace: str, set_name: str) -> SetNote | None:
    pool = _get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM set_notes WHERE connection_id = $1 AND namespace = $2 AND set_name = $3",
        connection_id,
        namespace,
        set_name,
    )
    return _row_to_set_note(row) if row else None


async def list_set_notes(connection_id: str, namespace: str | None = None) -> list[SetNote]:
    pool = _get_pool()
    if namespace is None:
        rows = await pool.fetch(
            "SELECT * FROM set_notes WHERE connection_id = $1 ORDER BY namespace, set_name",
            connection_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT * FROM set_notes WHERE connection_id = $1 AND namespace = $2 ORDER BY set_name",
            connection_id,
            namespace,
        )
    return [_row_to_set_note(r) for r in rows]


async def batch_get_set_notes(
    connection_id: str,
    namespace: str,
    set_names: list[str],
) -> dict[str, str]:
    if not set_names:
        return {}
    pool = _get_pool()
    # PG supports array IN with ANY($n::text[]) — single binding instead of
    # variadic placeholders, which keeps the prepared-statement cache stable.
    rows = await pool.fetch(
        """SELECT set_name, note FROM set_notes
               WHERE connection_id = $1 AND namespace = $2
                 AND set_name = ANY($3::text[])""",
        connection_id,
        namespace,
        set_names,
    )
    return {row["set_name"]: row["note"] for row in rows}


# ---------------------------------------------------------------------------
# Async public API — record notes
# ---------------------------------------------------------------------------


def _row_to_record_note(row: asyncpg.Record) -> RecordNote:
    return RecordNote(
        connectionId=row["connection_id"],
        namespace=row["namespace"],
        setName=row["set_name"],
        pkText=row["pk_text"],
        pkType=row["pk_type"],
        digestHex=row["digest_hex"],
        note=row["note"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        updatedBy=row["updated_by"],
    )


async def upsert_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
    note: str,
    digest_hex: str | None,
    updated_by: str | None,
) -> RecordNote:
    pool = _get_pool()
    now = datetime.now(UTC).isoformat()
    row = await pool.fetchrow(
        """INSERT INTO record_notes (connection_id, namespace, set_name, pk_text, pk_type,
                                     digest_hex, note, created_at, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (connection_id, namespace, set_name, pk_text, pk_type) DO UPDATE SET
               digest_hex = EXCLUDED.digest_hex,
               note = EXCLUDED.note,
               updated_at = EXCLUDED.updated_at,
               updated_by = EXCLUDED.updated_by
           RETURNING *""",
        connection_id,
        namespace,
        set_name,
        pk_text,
        pk_type,
        digest_hex,
        note,
        now,
        now,
        updated_by,
    )
    return _row_to_record_note(row)


async def delete_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> bool:
    pool = _get_pool()
    result = await pool.execute(
        """DELETE FROM record_notes
               WHERE connection_id = $1 AND namespace = $2 AND set_name = $3
                 AND pk_text = $4 AND pk_type = $5""",
        connection_id,
        namespace,
        set_name,
        pk_text,
        pk_type,
    )
    return result == "DELETE 1"


async def get_record_note(
    connection_id: str,
    namespace: str,
    set_name: str,
    pk_text: str,
    pk_type: StoredPkType,
) -> RecordNote | None:
    pool = _get_pool()
    row = await pool.fetchrow(
        """SELECT * FROM record_notes
               WHERE connection_id = $1 AND namespace = $2 AND set_name = $3
                 AND pk_text = $4 AND pk_type = $5""",
        connection_id,
        namespace,
        set_name,
        pk_text,
        pk_type,
    )
    return _row_to_record_note(row) if row else None


async def list_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
) -> list[RecordNote]:
    pool = _get_pool()
    rows = await pool.fetch(
        """SELECT * FROM record_notes
               WHERE connection_id = $1 AND namespace = $2 AND set_name = $3
               ORDER BY pk_text""",
        connection_id,
        namespace,
        set_name,
    )
    return [_row_to_record_note(r) for r in rows]


async def batch_get_record_notes(
    connection_id: str,
    namespace: str,
    set_name: str,
    pks: list[tuple[str, StoredPkType]],
) -> dict[tuple[str, StoredPkType], str]:
    if not pks:
        return {}
    pool = _get_pool()
    # Encode the (pk_text, pk_type) pairs as parallel arrays so we get one
    # bound parameter per array instead of variadic placeholders. UNNEST
    # zips them into a temporary relation we INNER JOIN against record_notes.
    pk_texts = [p[0] for p in pks]
    pk_types = [p[1] for p in pks]
    rows = await pool.fetch(
        """SELECT rn.pk_text, rn.pk_type, rn.note
               FROM record_notes rn
               INNER JOIN UNNEST($4::text[], $5::text[]) AS req(pk_text, pk_type)
                       ON rn.pk_text = req.pk_text AND rn.pk_type = req.pk_type
               WHERE rn.connection_id = $1 AND rn.namespace = $2 AND rn.set_name = $3""",
        connection_id,
        namespace,
        set_name,
        pk_texts,
        pk_types,
    )
    return {(row["pk_text"], row["pk_type"]): row["note"] for row in rows}


# ---------------------------------------------------------------------------
# Async public API — operational guides
# ---------------------------------------------------------------------------


async def upsert_guide(
    workspace_id: str,
    guide_type: str,
    title: str,
    content: str,
    updated_by: str | None,
) -> Guide:
    """Insert or replace the guide identified by ``(workspace_id, guide_type)``.

    ``created_at`` is preserved on update — only the INSERT branch sets it,
    matching the SQLite backend.
    """
    pool = _get_pool()
    now = datetime.now(UTC).isoformat()
    row = await pool.fetchrow(
        """INSERT INTO guides (workspace_id, guide_type, title, content,
                               created_at, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (workspace_id, guide_type) DO UPDATE SET
               title = EXCLUDED.title,
               content = EXCLUDED.content,
               updated_at = EXCLUDED.updated_at,
               updated_by = EXCLUDED.updated_by
           RETURNING *""",
        workspace_id,
        guide_type,
        title,
        content,
        now,
        now,
        updated_by,
    )
    return row_to_guide(row)


async def get_guide(workspace_id: str, guide_type: str) -> Guide | None:
    pool = _get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM guides WHERE workspace_id = $1 AND guide_type = $2",
        workspace_id,
        guide_type,
    )
    return row_to_guide(row) if row else None


async def list_guides(workspace_id: str) -> list[Guide]:
    pool = _get_pool()
    rows = await pool.fetch(
        "SELECT * FROM guides WHERE workspace_id = $1 ORDER BY guide_type",
        workspace_id,
    )
    return [row_to_guide(r) for r in rows]


async def delete_guide(workspace_id: str, guide_type: str) -> bool:
    pool = _get_pool()
    result = await pool.execute(
        "DELETE FROM guides WHERE workspace_id = $1 AND guide_type = $2",
        workspace_id,
        guide_type,
    )
    return result == "DELETE 1"

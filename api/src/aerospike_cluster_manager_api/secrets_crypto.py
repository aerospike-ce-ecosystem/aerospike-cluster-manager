"""At-rest encryption for sensitive connection-profile fields.

Encrypts ``connections.password`` (and any other future opt-in field) with
``cryptography.fernet.Fernet`` so a leaked DB image / SQLite file / Postgres
backup does not directly hand attackers downstream Aerospike credentials.

Threat model
============

* In-scope: passive disclosure of the database file or backup. An attacker
  who can read ``connections.db`` (or the equivalent Postgres dump) cannot
  recover the plaintext password without also obtaining ``ACM_PASSWORD_KEK``.
* Out-of-scope: a privileged process attacker who can read the live API
  process memory or env vars. Once the API is running with the KEK
  loaded, plaintext passwords are recoverable in-memory by definition;
  Fernet is at-rest encryption, not a vault.

KEK provisioning
================

The Key Encryption Key is provisioned via ``ACM_PASSWORD_KEK`` (44-char
urlsafe base64, the canonical Fernet key shape). The module enforces
the env-or-explicit-opt-in policy at import time:

* ``ACM_PASSWORD_KEK`` set, valid → use it.
* ``ACM_PASSWORD_KEK`` unset, ``ACM_ALLOW_EPHEMERAL_KEK=true`` → emit a
  loud warning and generate a process-local ephemeral key. Existing rows
  written under a previous ephemeral key become unreadable on restart;
  this is documented as dev-only.
* ``ACM_PASSWORD_KEK`` unset, no opt-in → ``RuntimeError`` at import time
  with a copy-pasteable command for generating a key. The intent is to
  fail loudly during deploys rather than silently downgrade to plaintext.

Ciphertext format
=================

We prefix Fernet output with ``enc:v1:`` so the read path can distinguish
already-encrypted values from legacy plaintext during migration. The ``v1``
discriminator leaves room for a future re-key path (``enc:v2:``) without a
schema change.
"""

from __future__ import annotations

import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Versioned prefix on Fernet ciphertext so the read path can distinguish
# ``enc:v1:<token>`` (encrypt result, current schema) from a legacy plaintext
# password row written before this module landed. ``decrypt_password`` returns
# unprefixed input verbatim, which is the migration-compat read path.
_PREFIX_V1 = "enc:v1:"


class _CryptoState:
    """Module-level state holder. Kept in a class so tests can monkey-patch
    the singleton without rewriting every consumer."""

    fernet: Fernet | None = None
    is_ephemeral: bool = False


_state = _CryptoState()


def _bool_env(name: str) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return False
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _build_fernet() -> tuple[Fernet, bool]:
    """Resolve the KEK from env and return ``(Fernet, is_ephemeral)``.

    Raises ``RuntimeError`` when the env is unset and the operator has not
    explicitly opted into the ephemeral key path. The error message includes
    the canonical command for generating a key so the deploy fix is
    obvious from the log line alone.
    """
    raw = os.getenv("ACM_PASSWORD_KEK", "").strip()
    if raw:
        try:
            return Fernet(raw.encode("utf-8")), False
        except (ValueError, TypeError) as exc:
            raise RuntimeError(
                "ACM_PASSWORD_KEK is set but is not a valid Fernet key. "
                "Generate one with: "
                "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            ) from exc
    if _bool_env("ACM_ALLOW_EPHEMERAL_KEK"):
        # Explicit dev opt-in. The key lives in process memory only; rows
        # written under it become unreadable on the next restart. We log
        # at WARNING (not INFO) so this never gets quietly tolerated in
        # operator dashboards.
        ephemeral = Fernet.generate_key()
        logger.warning(
            "ACM_PASSWORD_KEK is unset and ACM_ALLOW_EPHEMERAL_KEK=true; "
            "generating a process-local ephemeral key. Stored connection "
            "passwords will become UNREADABLE on the next restart. "
            "DO NOT use this mode in production."
        )
        return Fernet(ephemeral), True
    raise RuntimeError(
        "ACM_PASSWORD_KEK is required for at-rest encryption of stored "
        "connection passwords. Generate one with: "
        "python -c 'from cryptography.fernet import Fernet; "
        "print(Fernet.generate_key().decode())' "
        "and export it as ACM_PASSWORD_KEK. "
        "For dev-only ephemeral mode set ACM_ALLOW_EPHEMERAL_KEK=true."
    )


def _get_fernet() -> Fernet:
    """Return the cached Fernet instance, building it on first use.

    Lazy build so the module can be imported by code paths that don't touch
    the connection table (tests of unrelated modules) without forcing every
    consumer to set ACM_PASSWORD_KEK. The first call to ``encrypt_password``
    or ``decrypt_password`` is the load-bearing one.
    """
    if _state.fernet is None:
        _state.fernet, _state.is_ephemeral = _build_fernet()
    return _state.fernet


def reset_for_tests() -> None:
    """Clear cached Fernet so the next call re-resolves env. Tests only."""
    _state.fernet = None
    _state.is_ephemeral = False


def is_ephemeral() -> bool:
    """Return True when the active Fernet was provisioned from an ephemeral
    in-memory key (i.e. ``ACM_ALLOW_EPHEMERAL_KEK=true`` path).

    Used by ``main.py`` startup logging to surface the dev-only mode when
    operators audit what KEK source is in effect.
    """
    if _state.fernet is None:
        # Force resolution so callers don't see a misleading False before
        # the first encrypt/decrypt.
        _get_fernet()
    return _state.is_ephemeral


def encrypt_password(plaintext: str) -> str:
    """Encrypt ``plaintext`` with the active KEK.

    Empty / ``None`` is the operator's signal that no password is set on the
    connection (Aerospike supports anonymous binds in CE) — we pass it
    through verbatim so that intent round-trips through the DB. Callers
    should normalise to an empty string before calling, but we accept
    ``None`` defensively.
    """
    if not plaintext:
        return ""
    fernet = _get_fernet()
    token = fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")
    return _PREFIX_V1 + token


def decrypt_password(stored: str | None) -> str | None:
    """Decrypt a value previously produced by :func:`encrypt_password`.

    Migration compatibility: if the stored value lacks the ``enc:v1:``
    prefix it is returned verbatim. This lets the API keep serving rows
    that were written before the encryption migration ran. The startup
    migration in ``db/__init__.py`` rewrites those rows on the next boot
    so the legacy branch only executes during the rollover window.

    Empty strings and ``None`` are passed through (no password set).
    """
    if stored is None or stored == "":
        return stored
    if not stored.startswith(_PREFIX_V1):
        # Legacy plaintext row — caller will see the original password.
        # Migration is responsible for rewriting these eventually.
        return stored
    fernet = _get_fernet()
    token = stored[len(_PREFIX_V1) :]
    try:
        return fernet.decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        # The KEK has changed (or the row was written under a different
        # ephemeral key). Surface a deterministic error so the API can
        # 500 instead of silently returning a corrupted password.
        raise RuntimeError(
            "Failed to decrypt stored connection password: KEK mismatch. "
            "If you recently rotated ACM_PASSWORD_KEK, you must re-encrypt "
            "the password column with the new key (or restore the previous "
            "key). For ephemeral-mode dev environments this is expected "
            "after a restart — recreate the connection profile."
        ) from exc


def is_encrypted(stored: str | None) -> bool:
    """Return True when ``stored`` carries the ``enc:v1:`` ciphertext marker.

    Used by the startup migration to skip already-encrypted rows. Treats
    ``None`` and the empty string as "no password" — neither needs
    encryption.
    """
    return bool(stored) and stored.startswith(_PREFIX_V1)

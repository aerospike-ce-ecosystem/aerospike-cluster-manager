"""Shared utilities for admin (user/role management) routers."""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any

from aerospike_py.exception import AdminError, AerospikeError, ServerError
from fastapi import HTTPException

from aerospike_cluster_manager_api.constants import EE_MSG


def _msg_lower(exc: BaseException) -> str:
    return str(exc).lower()


def _is_security_disabled(msg_lower: str) -> bool:
    """Backward-compat string match used by older aerospike-py releases."""
    return "security" in msg_lower or "not enabled" in msg_lower or "not supported" in msg_lower


def _is_already_exists(exc: BaseException, msg_lower: str) -> bool:
    """Detect "user/role already exists" errors.

    aerospike-py 0.6 maps Aerospike result codes 61 (UserAlreadyExists) and
    71 (RoleAlreadyExists) to plain ``ServerError`` with a message of the form
    ``AEROSPIKE_ERR (-1): Server error: UserAlreadyExists, In Doubt: false,
    Node: ...``. We prefer detecting the Rust ``ResultCode`` Debug variant
    name (which is stable) and fall back to the lowercase human string for
    cross-version compatibility.
    """
    raw = str(exc)
    if "UserAlreadyExists" in raw or "RoleAlreadyExists" in raw:
        return True
    return "already exists" in msg_lower


def _is_invalid_user_or_role(exc: BaseException, msg_lower: str) -> bool:
    """Detect "user/role not found" (Aerospike result codes 60/70).

    Code 60 (``InvalidUser``) is mapped by aerospike-py to ``AdminError``,
    while code 70 (``InvalidRole``) currently falls through to ``ServerError``.
    Both surface as the human string "Invalid user" / "Invalid role" inside
    the message; we prefer the Rust Debug variant name and fall back to the
    string match.
    """
    raw = str(exc)
    if "InvalidUser" in raw or "InvalidRole" in raw:
        return True
    return "invalid user" in msg_lower or "invalid role" in msg_lower


def admin_endpoint(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator that maps aerospike-py admin errors to structured HTTP responses.

    Both admin_users and admin_roles routers share this identical error
    handling pattern.  Centralising it here removes duplication and ensures
    consistent behaviour.

    Mapping (preferred via exception class + Rust ``ResultCode`` variant name;
    string match retained as fallback for older aerospike-py builds):

    * ``AdminError`` with InvalidUser → 404
    * ``AdminError`` (security/not enabled/not supported) → 403 (EE_MSG)
    * ``ServerError`` with UserAlreadyExists / RoleAlreadyExists → 409
    * ``ServerError`` with InvalidRole → 404
    * other ``AerospikeError`` carrying security text → 403 (legacy)
    * everything else propagates to FastAPI's global handler.
    """

    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except AdminError as e:
            msg = _msg_lower(e)
            if _is_invalid_user_or_role(e, msg):
                raise HTTPException(status_code=404, detail="User or role not found") from None
            # AdminError is the canonical "security disabled / privilege" error.
            raise HTTPException(status_code=403, detail=EE_MSG) from None
        except ServerError as e:
            msg = _msg_lower(e)
            if _is_already_exists(e, msg):
                raise HTTPException(status_code=409, detail="User or role already exists") from None
            if _is_invalid_user_or_role(e, msg):
                raise HTTPException(status_code=404, detail="User or role not found") from None
            # Fall through to the global ServerError handler.
            raise
        except AerospikeError as e:
            # Backward-compat fallback: some older aerospike-py builds may surface
            # security errors as a plain AerospikeError without the AdminError
            # subclass. Detect via lowercase string match.
            if _is_security_disabled(_msg_lower(e)):
                raise HTTPException(status_code=403, detail=EE_MSG) from None
            raise

    return wrapper

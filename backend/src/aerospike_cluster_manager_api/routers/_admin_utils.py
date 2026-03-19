"""Shared utilities for admin (user/role management) routers."""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any

from aerospike_py.exception import AdminError, AerospikeError
from fastapi import HTTPException

from aerospike_cluster_manager_api.constants import EE_MSG


def admin_endpoint(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator that maps AdminError / security-related AerospikeError to HTTP 403.

    Both admin_users and admin_roles routers share this identical error
    handling pattern.  Centralising it here removes duplication and ensures
    consistent behaviour.
    """

    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except AdminError:
            raise HTTPException(status_code=403, detail=EE_MSG) from None
        except AerospikeError as e:
            msg = str(e).lower()
            if "security" in msg or "not enabled" in msg or "not supported" in msg:
                raise HTTPException(status_code=403, detail=EE_MSG) from None
            raise

    return wrapper

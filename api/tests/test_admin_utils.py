"""Unit tests for ``routers._admin_utils.admin_endpoint`` error mapping.

These exercise the decorator directly so we don't need a running Aerospike
cluster or the full FastAPI app stack.
"""

from __future__ import annotations

import pytest
from aerospike_py.exception import AdminError, AerospikeError, ServerError
from fastapi import HTTPException

from aerospike_cluster_manager_api.routers._admin_utils import admin_endpoint


@admin_endpoint
async def _passthrough(*, raise_with: BaseException | None = None) -> str:
    if raise_with is not None:
        raise raise_with
    return "ok"


class TestAdminEndpointDecorator:
    async def test_passes_through_on_success(self) -> None:
        result = await _passthrough()
        assert result == "ok"

    # ----- AdminError → 403 / 404 ------------------------------------------------

    async def test_admin_error_maps_to_403(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(raise_with=AdminError("AEROSPIKE_ERR (52): security not enabled"))
        assert exc_info.value.status_code == 403

    async def test_admin_error_invalid_user_maps_to_404(self) -> None:
        # Rust Debug variant name path
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(
                raise_with=AdminError("AEROSPIKE_ERR (60): Server error: InvalidUser, In Doubt: false, Node: BB...")
            )
        assert exc_info.value.status_code == 404

    async def test_admin_error_invalid_user_string_fallback(self) -> None:
        # Older aerospike-py versions might surface only the human-readable text.
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(raise_with=AdminError("Invalid user"))
        assert exc_info.value.status_code == 404

    # ----- ServerError → 409 (already exists) -----------------------------------

    async def test_server_error_user_already_exists_maps_to_409(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(
                raise_with=ServerError(
                    "AEROSPIKE_ERR (-1): Server error: UserAlreadyExists, In Doubt: false, Node: BB..."
                )
            )
        assert exc_info.value.status_code == 409

    async def test_server_error_role_already_exists_maps_to_409(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(
                raise_with=ServerError(
                    "AEROSPIKE_ERR (-1): Server error: RoleAlreadyExists, In Doubt: false, Node: BB..."
                )
            )
        assert exc_info.value.status_code == 409

    async def test_server_error_already_exists_string_fallback(self) -> None:
        # Backward-compat path — older aerospike-py may not embed the variant name.
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(raise_with=ServerError("AEROSPIKE_ERR (61): User already exists"))
        assert exc_info.value.status_code == 409

    # ----- ServerError → 404 (invalid role) -------------------------------------

    async def test_server_error_invalid_role_maps_to_404(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(
                raise_with=ServerError("AEROSPIKE_ERR (-1): Server error: InvalidRole, In Doubt: false, Node: BB...")
            )
        assert exc_info.value.status_code == 404

    # ----- Pass-through for unknown server errors -------------------------------

    async def test_unknown_server_error_propagates(self) -> None:
        original = ServerError("AEROSPIKE_ERR (1): Server error: ServerError, In Doubt: false, Node: BB...")
        with pytest.raises(ServerError):
            await _passthrough(raise_with=original)

    # ----- Generic AerospikeError -----------------------------------------------

    async def test_generic_aerospike_security_text_maps_to_403(self) -> None:
        # Path used as a forward-compat fallback if a future aerospike-py
        # surfaces security errors as plain AerospikeError.
        with pytest.raises(HTTPException) as exc_info:
            await _passthrough(raise_with=AerospikeError("Security not supported on this cluster"))
        assert exc_info.value.status_code == 403

    async def test_generic_aerospike_unrelated_propagates(self) -> None:
        original = AerospikeError("Unrelated transient failure")
        with pytest.raises(AerospikeError):
            await _passthrough(raise_with=original)

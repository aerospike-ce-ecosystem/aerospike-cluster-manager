"""Tests for structured Aerospike result-code error mapping.

Covers the migration of the ``ServerError`` -> HTTP mapping (``main.py``) away
from brittle message-substring matching (``"failforbidden" in str(exc)``) to
detection by the stable numeric Aerospike result code. Both detection paths are
exercised:

* a structured ``exc.result_code`` attribute (aerospike-py ADR-0011), and
* the message-string fallback (``AEROSPIKE_ERR (<code>)``) emitted by
  currently-released aerospike-py.
"""

from __future__ import annotations

import pytest
from aerospike_py.exception import ServerError
from fastapi import Request

from aerospike_cluster_manager_api.aerospike_errors import RESULT_CODE_FAIL_FORBIDDEN, result_code_of
from aerospike_cluster_manager_api.main import app


class _AttrError(Exception):
    """Exception carrying a structured ``result_code`` attribute."""

    def __init__(self, message: str, result_code: object) -> None:
        super().__init__(message)
        self.result_code = result_code


# ---------------------------------------------------------------------------
# result_code_of — pure extraction logic
# ---------------------------------------------------------------------------


class TestResultCodeOf:
    def test_prefers_structured_attribute(self):
        # No code in the message at all — only the structured attribute.
        exc = _AttrError("something went wrong", RESULT_CODE_FAIL_FORBIDDEN)
        assert result_code_of(exc) == RESULT_CODE_FAIL_FORBIDDEN

    def test_structured_attribute_wins_over_message(self):
        # Attribute says 22, message says 1 — the attribute must take priority.
        exc = _AttrError("AEROSPIKE_ERR (1): Server error", RESULT_CODE_FAIL_FORBIDDEN)
        assert result_code_of(exc) == RESULT_CODE_FAIL_FORBIDDEN

    def test_message_fallback_when_no_attribute(self):
        # Mirrors the currently-released aerospike-py rendering.
        exc = Exception("AEROSPIKE_ERR (22): Server error: FailForbidden, In Doubt: false")
        assert result_code_of(exc) == 22

    def test_message_fallback_batch_format(self):
        # Batch errors embed the code before the "[batch_index=N]" suffix.
        exc = Exception("AEROSPIKE_ERR (22) [batch_index=3]: Server error")
        assert result_code_of(exc) == 22

    def test_message_fallback_negative_code(self):
        exc = Exception("AEROSPIKE_ERR (-1): Server error: generic")
        assert result_code_of(exc) == -1

    def test_string_attribute_is_parsed(self):
        exc = _AttrError("opaque", "22")
        assert result_code_of(exc) == 22

    def test_bool_attribute_is_ignored(self):
        # bool is an int subclass; a stray True must not be read as code 1.
        exc = _AttrError("AEROSPIKE_ERR (22): x", True)
        assert result_code_of(exc) == 22

    def test_returns_none_when_absent(self):
        assert result_code_of(Exception("totally unrelated message")) is None


# ---------------------------------------------------------------------------
# ServerError -> HTTP handler behaviour (both detection paths)
# ---------------------------------------------------------------------------


def _make_request() -> Request:
    # The handler does not read the request (it only reads the request-id
    # ContextVar, which has a default), so a minimal scope is sufficient.
    return Request({"type": "http", "method": "GET", "path": "/", "headers": []})


@pytest.fixture()
def server_error_handler():
    handler = app.exception_handlers.get(ServerError)
    assert handler is not None, "ServerError exception handler is not registered"
    return handler


class TestServerErrorHandler:
    async def test_forbidden_via_result_code_attribute(self, server_error_handler):
        # Structured attribute path (forward-compatible with aerospike-py ADR-0011).
        # Message deliberately omits "failforbidden" so a substring check would miss it.
        exc = ServerError("AEROSPIKE_ERR (22): Server error")
        exc.result_code = RESULT_CODE_FAIL_FORBIDDEN
        response = await server_error_handler(_make_request(), exc)
        assert response.status_code == 403
        assert b"nsup-period" in response.body

    async def test_forbidden_via_message_fallback(self, server_error_handler):
        # No structured attribute — detection relies solely on the embedded code.
        exc = ServerError("AEROSPIKE_ERR (22): Server error: FailForbidden, In Doubt: false")
        assert not hasattr(exc, "result_code")
        response = await server_error_handler(_make_request(), exc)
        assert response.status_code == 403
        assert b"nsup-period" in response.body

    async def test_other_server_error_maps_to_500(self, server_error_handler):
        # A non-forbidden server error must still fall through to the generic 500.
        exc = ServerError("AEROSPIKE_ERR (1): Server error: generic failure")
        response = await server_error_handler(_make_request(), exc)
        assert response.status_code == 500

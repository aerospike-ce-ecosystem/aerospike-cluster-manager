"""Tests for ``_map_k8s_error`` status pass-through.

``K8sApiError.status`` already carries the real HTTP status the Kubernetes
API server returned (``K8sClient._wrap_api_exception`` forwards the
``ApiException`` status verbatim). ``_map_k8s_error`` must surface that
status transparently for any genuine 4xx/5xx error, rather than collapsing
unexpected-but-valid statuses (410, 412, 502, 504, ...) to a misleading 500.
"""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.k8s_client import K8sApiError
from aerospike_cluster_manager_api.routers.k8s_clusters import _map_k8s_error


@pytest.mark.parametrize(
    "status",
    [400, 401, 403, 404, 408, 409, 422, 429, 503],
)
def test_known_statuses_pass_through(status: int) -> None:
    """The statuses the old allowlist handled still map to themselves."""
    exc = _map_k8s_error(K8sApiError(status=status, reason="r", message="m"))
    assert exc.status_code == status


@pytest.mark.parametrize(
    "status",
    [410, 412, 415, 502, 504, 451, 423],
)
def test_other_valid_http_error_statuses_pass_through(status: int) -> None:
    """Real K8s API statuses outside the old allowlist must not collapse to 500.

    410 Gone (stale resourceVersion), 412 Precondition Failed (optimistic
    concurrency on update), and 502/504 from an aggregated/proxied API server
    are all real responses that previously became an opaque ``500``.
    """
    exc = _map_k8s_error(K8sApiError(status=status, reason="r", message="m"))
    assert exc.status_code == status


@pytest.mark.parametrize("status", [0, -1, 200, 302, 399, 600, 700])
def test_invalid_or_non_error_statuses_default_to_500(status: int) -> None:
    """Anything that is not a valid HTTP error status defaults to 500.

    ``0`` is what ``_wrap_api_exception`` would carry for a connection failure
    if it were not already normalized; success/redirect/out-of-range values
    have no meaningful error mapping.
    """
    exc = _map_k8s_error(K8sApiError(status=status, reason="r", message="m"))
    assert exc.status_code == 500


def test_detail_prefers_message_then_reason() -> None:
    """Detail uses ``message`` when present, falling back to ``reason``."""
    assert _map_k8s_error(K8sApiError(status=404, reason="NotFound", message="gone")).detail == "gone"
    assert _map_k8s_error(K8sApiError(status=404, reason="NotFound", message="")).detail == "NotFound"

"""CE-aware MCP error mapping.

The MCP tool wrappers (B.1+) and the registry decorator (A.12) call
:func:`map_aerospike_errors` to translate aerospike-py exceptions and
service-layer domain errors into :class:`MCPToolError` instances with
stable, user-facing wording.

Wire-message wording follows
``docs/plans/2026-05-07-acm-mcp-design.md`` Section 4.

Design notes:

* :class:`MCPToolError` is a plain :class:`Exception` subclass — keeps
  ``except`` clauses in the registry decorator simple and avoids any
  framework coupling (no fastapi/HTTPException).
* Only specific known aerospike-py subclasses are mapped. The base
  :class:`aerospike_py.exception.AerospikeError` is intentionally **not**
  caught: unknown errors propagate so the registry can log them and
  return a generic ``isError`` block without masking real bugs.
* :func:`raise_ce_unsupported` is the canonical helper for code paths
  that hit enterprise-only features (XDR shipping, TLS, etc.) — keeps
  Phase 2 K8s tooling consistent with Phase 1 wording.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from typing import Any

import aerospike_py

from aerospike_cluster_manager_api.info_verbs import InfoVerbNotAllowed
from aerospike_cluster_manager_api.k8s_client import K8sApiError
from aerospike_cluster_manager_api.predicate import UnknownPredicateOperator
from aerospike_cluster_manager_api.services.clusters_service import (
    NamespaceConfigError,
    NamespaceNotFoundError,
    NodeNotFoundError,
)
from aerospike_cluster_manager_api.services.connections_service import (
    ConnectionNotFoundError,
    WorkspaceNotFoundError,
)
from aerospike_cluster_manager_api.services.records_service import (
    InvalidPkPattern,
    PrimaryKeyMissing,
    SetRequiredForPkLookup,
)


class MCPToolError(Exception):
    """Wire-level error surfaced as an MCP ``isError`` content block.

    ``code`` is an optional machine-readable hint (e.g. ``"record_not_found"``)
    that the registry decorator can attach to OTel spans or the structured
    log line. The user-facing message is the standard exception ``str()``.
    """

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


def raise_ce_unsupported(feature: str) -> None:
    """Raise an :class:`MCPToolError` for an enterprise-only code path.

    Used by Phase 2 K8s tooling and any tool wrapper that hits an
    enterprise-only feature (XDR shipping, TLS, ACL beyond CE limits).
    The wording matches Section 4 of the design doc verbatim.
    """
    raise MCPToolError(
        f"This operation is not supported on Aerospike CE 8.1: {feature}",
        code="ce_unsupported",
    )


def _record_ident(ns: str | None, set_name: str | None, key: Any) -> str:
    """Format a ``"{ns}/{set}/{key}"`` suffix for record-level errors.

    Returns an empty string if any of the three are missing — callers
    fall back to the bare ``"Record not found"`` form in that case.
    """
    if ns is None or set_name is None or key is None:
        return ""
    return f": {ns}/{set_name}/{key}"


@contextlib.contextmanager
def map_aerospike_errors(
    *,
    ns: str | None = None,
    set_name: str | None = None,
    key: Any = None,
) -> Iterator[None]:
    """Translate known errors into :class:`MCPToolError`.

    Optional ``ns``/``set_name``/``key`` provide context for record-level
    messages — when all three are supplied, the wire message includes
    ``": {ns}/{set}/{key}"`` so the model can address the bad record
    directly. Otherwise the bare form is used.

    Other exceptions (including the aerospike-py base
    :class:`aerospike_py.exception.AerospikeError`) propagate unchanged
    so the caller's ``except`` chain can log/diagnose them without the
    mapping layer hiding the original stack.
    """
    try:
        yield
    except aerospike_py.RecordNotFound as e:
        raise MCPToolError(
            f"Record not found{_record_ident(ns, set_name, key)}",
            code="record_not_found",
        ) from e
    except aerospike_py.RecordExistsError as e:
        raise MCPToolError(
            f"Record already exists{_record_ident(ns, set_name, key)}",
            code="record_exists",
        ) from e
    except aerospike_py.BackpressureError as e:
        # Production-grade signal: client-side concurrent-op queue is
        # saturated. Surface a stable code so model-side wrappers (and
        # operator dashboards) can apply retry-with-backoff. The message
        # carries the underlying client wording so context isn't lost.
        raise MCPToolError(
            f"Aerospike client is saturated; retry with backoff: {e}",
            code="backpressure",
        ) from e
    except UnknownPredicateOperator as e:
        # Predicate dispatch table did not recognise the operator — input
        # validation failure on the caller's side. Surfaces as the same
        # ``invalid_argument`` family the SDK reserves for malformed
        # tool arguments.
        raise MCPToolError(str(e), code="invalid_argument") from e
    except InfoVerbNotAllowed as e:
        # Read-only profile attempted an unwhitelisted asinfo verb —
        # input-validation failure, same wire shape as
        # UnknownPredicateOperator above. The model should pick a different
        # verb, not escalate, so ``invalid_argument`` (not ``access_denied``)
        # is the right signal.
        raise MCPToolError(str(e), code="invalid_argument") from e
    except K8sApiError as e:
        # K8s API errors carry an HTTP-style status code from the underlying
        # kubernetes-client ``ApiException``. Translate to the MCP code family
        # used by the rest of this module so AI clients see stable wire codes
        # (404 -> ``not_found``, 403 -> ``access_denied``, 409 -> ``conflict``,
        # other 4xx -> ``invalid_argument``, 5xx -> ``internal_error``).
        if e.status == 404:
            raise MCPToolError(str(e), code="not_found") from e
        if e.status == 403:
            raise MCPToolError(str(e), code="access_denied") from e
        if e.status == 409:
            raise MCPToolError(str(e), code="conflict") from e
        if 400 <= e.status < 500:
            raise MCPToolError(str(e), code="invalid_argument") from e
        # 5xx -- surface as internal_error so OTel records and operators can
        # follow up; the message keeps the underlying detail.
        raise MCPToolError(str(e), code="internal_error") from e
    except (
        ConnectionNotFoundError,
        WorkspaceNotFoundError,
        NamespaceNotFoundError,
        NodeNotFoundError,
        NamespaceConfigError,
        InvalidPkPattern,
        SetRequiredForPkLookup,
        PrimaryKeyMissing,
    ) as e:
        raise MCPToolError(str(e), code=type(e).__name__) from e

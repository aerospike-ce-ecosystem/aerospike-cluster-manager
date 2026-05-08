"""Shared fixtures and module-level imports for the MCP test package.

Two responsibilities:

1. Deterministic tool import: every ``mcp/tools/*`` module is imported here
   so the ``@tool`` decorator side-effects fire BEFORE any test in this
   package runs. Without this, the registry-based tests are order-sensitive
   — whichever test imports a tool module first triggers the registration,
   and tests run in isolation (``pytest tests/mcp/test_registry.py``)
   would see an empty registry.

2. ``patch_mcp_client`` fixture-style helper: the duplicated
   ``_patch_get_client`` boilerplate from ``test_record_tools.py``,
   ``test_query_tool.py``, and ``test_info_tools.py`` is consolidated
   here. Tests can either use the fixture (auto-injected mock client)
   or call the underlying helper directly when they need to control the
   mock's surface.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Force-import every tool module so the @tool decorator side-effects flush
# into the module-level _REGISTRY. Without these imports, a test invoked in
# isolation (``pytest tests/mcp/test_e2e.py``) would observe an empty
# registry. The ``noqa: F401`` markers tell ruff that the imports are
# load-bearing even though no name is referenced.
from aerospike_cluster_manager_api.mcp.tools import (  # noqa: F401
    cluster_info,
    connections,
    info_commands,
    k8s,
    query,
    records,
)

# ---------------------------------------------------------------------------
# Tool count constant — replaces the magic number ``21`` everywhere.
# ---------------------------------------------------------------------------

EXPECTED_TOOL_COUNT: int = 33
"""Total number of MCP tools registered by Phase 1 + read-only info + Phase 2 K8s + notes.

Breakdown:
* 8 connection tools (create, get, update, delete, list, connect, disconnect,
  test_connection)
* 3 cluster info (list_namespaces, list_sets, get_nodes)
* 7 record (get, exists, create, update, delete, delete_bin, truncate_set)
* 1 query
* 3 info commands (execute_info, execute_info_on_node, execute_info_read_only)
* 5 K8s (list_k8s_clusters, get_k8s_pods, get_k8s_events, scale_k8s_cluster,
  get_k8s_logs) -- Phase 2, #305
* 6 notes (update_set_note, delete_set_note, list_set_notes,
  update_record_note, delete_record_note, list_record_notes)
"""


# ---------------------------------------------------------------------------
# Helpers shared by per-tool tests
# ---------------------------------------------------------------------------


@contextmanager
def patch_mcp_client(module_name: str, client: MagicMock) -> Iterator[None]:
    """Replace ``client_manager.get_client`` on the named tool module.

    Drop-in replacement for the duplicated ``_patch_get_client`` helpers in
    ``test_record_tools.py``, ``test_query_tool.py``, and ``test_info_tools.py``.

    Parameters
    ----------
    module_name:
        Dotted path of the tool module that holds the ``client_manager``
        reference, e.g. ``"aerospike_cluster_manager_api.mcp.tools.records"``.
        We patch on the *module*'s ``client_manager`` attribute (not the
        canonical client_manager singleton) so per-test mocks don't leak.
    client:
        The mock client returned by ``get_client``.
    """
    import importlib

    module = importlib.import_module(module_name)
    with patch.object(
        module.client_manager,
        "get_client",
        new=AsyncMock(return_value=client),
    ):
        yield


@pytest.fixture
def mock_aerospike_client() -> MagicMock:
    """Vanilla ``MagicMock`` stand-in for ``aerospike_py.AsyncClient``.

    Tests that need finer-grained behaviour (specific return values,
    ``side_effect``, etc.) should ignore this fixture and build their own.
    """
    return MagicMock()

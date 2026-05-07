"""MCP tool modules.

Each submodule registers its tools at import time via the ``@tool(...)``
decorator from :mod:`aerospike_cluster_manager_api.mcp.registry`. The
auto-discovery wiring imports each submodule so the decorator
side-effects fire before :func:`register_all` flushes the accumulator
into the :class:`FastMCP` instance built by :func:`build_mcp_app`.

Adding a new tool category? Import the module here AND keep
``access_profile.WRITE_TOOLS`` in sync with any new mutation tools.

The ``@tool`` decorator's name uniqueness check is enforced at import
time — duplicate tool names raise :class:`ValueError` from
:func:`mcp.registry.tool` and abort the module import, which in turn
fails ``build_mcp_app`` at startup. Adding a tool with a name that
collides with an existing one is therefore caught immediately rather
than silently shadowing the prior registration.
"""

from aerospike_cluster_manager_api.mcp.tools import (  # noqa: F401  — import side-effects only
    cluster_info,
    connections,
    info_commands,
    k8s,
    query,
    records,
)

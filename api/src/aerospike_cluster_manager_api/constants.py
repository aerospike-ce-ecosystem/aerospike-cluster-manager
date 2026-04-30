"""Aerospike info command and client policy constants."""

from __future__ import annotations

import aerospike_py

# Info commands
INFO_NAMESPACES = "namespaces"
INFO_STATISTICS = "statistics"
INFO_BUILD = "build"
INFO_EDITION = "edition"
INFO_SERVICE = "service"
INFO_STATUS = "status"
INFO_NODE = "node"
INFO_UDF_LIST = "udf-list"


def info_namespace(ns: str) -> str:
    return f"namespace/{ns}"


def info_sets(ns: str) -> str:
    return f"sets/{ns}"


def info_sindex(ns: str) -> str:
    return f"sindex/{ns}"


def info_bins(ns: str) -> str:
    return f"bins/{ns}"


# Per-node command classification
PER_NODE_PREFIXES = ("sets/", "bins/", "namespace/")
PER_NODE_COMMANDS = frozenset({INFO_STATISTICS})


def is_per_node_command(cmd: str) -> bool:
    """Return True if the info command returns per-node (non-cluster-wide) data."""
    return cmd in PER_NODE_COMMANDS or cmd.startswith(PER_NODE_PREFIXES)


# Shared error messages
EE_MSG = "Security is not enabled. Add a 'security { }' block to aerospike.conf to manage users and roles."

# Namespace stat keys that must be summed across nodes
NS_SUM_KEYS = frozenset(
    {
        "objects",
        "tombstones",
        "memory_used_bytes",
        "memory-size",
        "data_used_bytes",
        "data_total_bytes",
        "device_used_bytes",
        "device-total-bytes",
        "client_read_success",
        "client_read_error",
        "client_write_success",
        "client_write_error",
    }
)

# Cache TTLs (seconds)
INFO_CACHE_TTL_STATIC = 60.0  # build, edition — rarely change at runtime
INFO_CACHE_TTL_VOLATILE = 5.0  # statistics, namespace/*, sets/* — balances freshness vs load

# Query limits
MAX_QUERY_RECORDS = 10_000

# Client policies
POLICY_READ = {"key": aerospike_py.POLICY_KEY_SEND, "total_timeout": 5000}
POLICY_WRITE = {"key": aerospike_py.POLICY_KEY_SEND, "total_timeout": 5000}
POLICY_QUERY = {"total_timeout": 30000, "key": aerospike_py.POLICY_KEY_SEND}

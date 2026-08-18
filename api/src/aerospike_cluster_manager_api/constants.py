"""Aerospike info command and client policy constants."""

from __future__ import annotations

import re

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


# A namespace name as the server will accept it: Aerospike caps namespace names
# at 31 characters, and the charset matches ``CreateNamespaceRequest.name``.
#
# This is a security boundary, not cosmetics. The builders below interpolate
# their argument into an info command, and ``\n`` is the batch separator (see
# ``info_verbs``): a namespace of ``test\ntruncate:namespace=test`` becomes a
# two-command frame whose head is a read. ``POST /clusters/{id}/info`` is
# guarded by the ``info_verbs`` allowlist (#469), but these builders are reached
# from routes that never call it -- ``GET /records/{id}?ns=...`` and the index
# routes -- so the frame has to be refused where it is built.
_INFO_NS_ARG_RE = re.compile(r"^[a-zA-Z0-9_-]{1,31}$")


class InvalidInfoArgument(ValueError):
    """Raised when a namespace argument would not be a single safe info frame.

    Subclasses :class:`ValueError` so the routers' existing ``except ValueError``
    branches surface it as a 400 rather than a 500.
    """

    def __init__(self, value: str) -> None:
        super().__init__(
            f"namespace {value!r} is not a valid Aerospike namespace name "
            "(letters, digits, underscore and hyphen, 1-31 characters)"
        )
        self.value = value


def _checked_ns(ns: str) -> str:
    if not _INFO_NS_ARG_RE.fullmatch(ns):
        raise InvalidInfoArgument(ns)
    return ns


def info_namespace(ns: str) -> str:
    return f"namespace/{_checked_ns(ns)}"


def info_sets(ns: str) -> str:
    return f"sets/{_checked_ns(ns)}"


def info_sindex(ns: str) -> str:
    return f"sindex/{_checked_ns(ns)}"


def info_bins(ns: str) -> str:
    return f"bins/{_checked_ns(ns)}"


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

# Namespace tunables reachable through POST /clusters/{conn_id}/namespaces,
# mapped from CreateNamespaceRequest field name to its asinfo set-config
# parameter name. Insertion order is the order parameters appear in the
# emitted command. Adding an entry widens what that endpoint can change on a
# live namespace — the model field must be Optional so that omitting it
# leaves the running value untouched.
NS_CONFIG_PARAMS: dict[str, str] = {
    "memorySize": "memory-size",
    "replicationFactor": "replication-factor",
}

# Cache TTLs (seconds)
INFO_CACHE_TTL_STATIC = 60.0  # build, edition — rarely change at runtime
INFO_CACHE_TTL_VOLATILE = 5.0  # statistics, namespace/*, sets/* — balances freshness vs load

# Query limits
MAX_QUERY_RECORDS = 10_000

# Client policies
POLICY_READ = {"key": aerospike_py.POLICY_KEY_SEND, "total_timeout": 5000}
POLICY_WRITE = {"key": aerospike_py.POLICY_KEY_SEND, "total_timeout": 5000}
POLICY_QUERY = {"total_timeout": 30000, "key": aerospike_py.POLICY_KEY_SEND}

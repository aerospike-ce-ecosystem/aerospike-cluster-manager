"""Read-only asinfo verb whitelist for the REST API info endpoint.

The Aerospike asinfo protocol multiplexes both reads (``namespaces``,
``version``, ``roster:``, ...) and writes (``set-config:``, ``recluster:``,
``truncate-namespace:``) over the same wire format. The read-only info
endpoint therefore cannot decide a command's safety from its shape alone
— it needs to inspect the *verb* (the leading token of the command).

This module is the single source of truth for that decision. The service
layer raises :class:`InfoVerbNotAllowed`, which the router maps to an
HTTP 400 with a "pick a different verb" hint.

To add a verb:

1. Verify in the Aerospike CE 8.1 docs that the verb is purely read-only
   and triggers no persistent state change (no log dump, no metric
   counter mutation beyond standard read paths).
2. Add it to :data:`READ_ONLY_INFO_VERBS` below in the matching category.
3. Add a unit test in ``tests/test_info_verbs.py`` so future drift is caught.
4. Update the literal-equality pin in
   ``tests/test_info_verbs.py::test_whitelist_membership_is_pinned`` —
   that pin exists so silent ADDITIONS are caught at review time, not
   just silent removals.
"""

from __future__ import annotations

READ_ONLY_INFO_VERBS: frozenset[str] = frozenset(
    {
        # Cluster meta (8)
        "version",
        "build",
        "build-os",
        "build-time",
        "node",
        "service",
        "services",
        "services-alumni",
        # Cluster topology / health (7)
        "nodes",
        "cluster-name",
        "cluster-stable",
        "cluster-generation",
        "cluster-info",
        "health-outliers",
        "health-stats",
        # Namespace / set / index (4)
        "namespaces",
        "namespace",
        "sets",
        "sindex",
        # Stats (3)
        "statistics",
        "latencies",
        "udf-list",
        # Strong-consistency / rack (2)
        "roster",
        "racks",
    }
)


# Curated hint verbs surfaced in error messages — the high-signal diagnostic
# reads operators actually want. Hand-picked rather than ``sorted()[:5]``,
# which would surface ``build-*`` triplicates that don't help the LLM pick a
# useful alternative.
_HINT_VERBS: tuple[str, ...] = ("namespaces", "version", "nodes", "statistics", "latencies")


class InfoVerbNotAllowed(ValueError):
    """Raised when an asinfo command's leading verb is not on the read-only allowlist.

    The REST router maps this to HTTP 400 with a "pick a different verb"
    hint so clients receive a clear "use a read-only verb" signal rather
    than a permission denial.
    """

    def __init__(self, verb: str) -> None:
        sample = ", ".join(_HINT_VERBS)
        super().__init__(
            f"Verb {verb!r} is not on the read-only asinfo whitelist; "
            f"pick from: {sample} (full list at info_verbs.READ_ONLY_INFO_VERBS)."
        )
        self.verb = verb


# asinfo wire format treats any of these as "verb stops here". Embedding any
# of them in a single command frame is unusual but legitimate (`namespaces;`
# is canonical when piping multiple commands), so we normalise the head
# rather than rejecting the whole command outright.
_VERB_TERMINATORS: tuple[str, ...] = (":", "/", ";", "\n", " ", "\t")


def extract_verb(command: str) -> str:
    """Return the leading verb of an asinfo command.

    asinfo commands take three syntactic shapes:

    * bare verb — ``"namespaces"`` or ``"namespaces;"`` (trailing ``;``
      is the canonical form when piping multiple commands)
    * path-style — ``"sets/test/myset"`` (verb followed by ``/``-separated args)
    * colon-style — ``"roster:namespace=test"`` (verb followed by ``:`` and
      ``;``-separated key=value args)

    The verb is everything up to the first occurrence of any character in
    :data:`_VERB_TERMINATORS` (``:``, ``/``, ``;``, ``\\n``, space, tab).
    Whitespace is trimmed first; an empty or whitespace-only command
    raises :class:`InfoVerbNotAllowed` with an empty verb so the caller
    surfaces a sensible error.

    Note: case-sensitive — asinfo itself is case-sensitive
    (``Namespaces`` is not the same verb as ``namespaces``).
    """
    cmd = command.strip()
    if not cmd:
        raise InfoVerbNotAllowed("")
    head = cmd
    for sep in _VERB_TERMINATORS:
        head = head.split(sep, 1)[0]
    return head


def assert_read_only(command: str) -> str:
    """Validate ``command`` against the read-only whitelist.

    Returns the parsed verb on success — callers can use it for telemetry
    (OTel span attributes, structured log fields). Raises
    :class:`InfoVerbNotAllowed` if the verb is not whitelisted; raises
    immediately, so no wire round-trip happens for a rejected command.
    """
    verb = extract_verb(command)
    if verb not in READ_ONLY_INFO_VERBS:
        raise InfoVerbNotAllowed(verb)
    return verb

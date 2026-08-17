"""Read-only asinfo verb whitelist for the REST API info endpoint.

The Aerospike asinfo protocol multiplexes both reads (``namespaces``,
``version``, ``roster:``, ...) and writes (``set-config:``, ``recluster:``,
``truncate-namespace:``) over the same wire format. The read-only info
endpoint therefore cannot decide a command's safety from its shape alone
— it needs to inspect the *verb* (the leading token of the command).

The verb alone is not sufficient, though: asinfo is a *multi-command* wire
format, so a frame whose leading verb is read-only can carry a second
command behind a separator. :func:`assert_read_only` therefore gates on two
things — the frame holds exactly one command
(:func:`assert_single_command`), and that command's verb is whitelisted —
and returns the validated string so callers transmit that rather than the
caller's original.

This module is the single source of truth for that decision. The service
layer raises :class:`InfoCommandRejected` subclasses, which the router maps
to an HTTP 400 with a "pick a different verb" / "one command per entry"
hint.

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

from typing import NamedTuple

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


class InfoCommandRejected(ValueError):
    """Base for every read-only info validation failure.

    Callers that only need "was this command accepted?" catch this; the
    REST router discriminates on the subclasses to produce a specific
    HTTP 400 message per failure mode.
    """


class InfoVerbNotAllowed(InfoCommandRejected):
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


class InfoCommandNotSingle(InfoCommandRejected):
    """Raised when one command frame does not hold exactly one asinfo command.

    Inspecting only the leading verb is not enough to decide a frame's
    safety: the asinfo wire format is multi-command, so a frame whose head
    is an allowlisted read verb can carry further text behind a separator
    that the verb check never covers. Rather than trying to decide whether
    each trailing command is also read-only, the read-only gate accepts only
    single-command frames — one command per ``commands[]`` entry.

    ``reason`` names the separator that broke the single-command shape; it is
    derived from the input's *shape*, never from its content, so the HTTP
    400 does not echo an unvalidated string back to the caller.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(
            f"Command is not a single asinfo command ({reason}); "
            "the read-only endpoint accepts exactly one command per entry — "
            "submit each command as its own element of 'commands'."
        )
        self.reason = reason


# asinfo wire format treats any of these as "verb stops here". This tuple is
# only about locating the verb — it is deliberately NOT the safety boundary,
# because splitting on a separator and keeping the head silently accepts
# whatever followed it. ``assert_single_command`` is the boundary: it runs
# first and rejects any frame whose shape puts text beyond the verb's reach.
#
# The whitespace entries overlap with the whitespace rule below, which makes
# them unreachable on the validated path. They stay because ``extract_verb``
# is public: called directly on ``"version <second command>"`` it must still
# stop at the space rather than return a mangled verb.
_VERB_TERMINATORS: tuple[str, ...] = (":", "/", ";", "\n", " ", "\t")

# Whitespace INSIDE a command frame is never legitimate. Every read-only verb
# is a single space-free token and every argument is `key=value` or a
# `/`-separated path, so once surrounding padding is stripped any whitespace
# left is a separator putting a second token beyond the verb check's reach:
# `"\n"` is the batch separator, and space / tab are verb terminators — the
# `_VERB_TERMINATORS` tuple above says so — which means the verb check reads
# only the text ahead of them.
#
# The test is ``str.isspace()`` rather than a fixed set, so the exotic members
# (VT, FF, NEL, NBSP) are rejected by the same rule and carry the same error
# class as the common ones instead of incidentally failing the verb lookup.
# These four are named for a legible message; anything else says "whitespace".
_SEPARATOR_NAMES: dict[str, str] = {
    "\n": "newline",
    "\r": "carriage return",
    " ": "space",
    "\t": "tab",
}


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

    This function answers "where does the verb end", not "is this command
    safe" — keeping the head of a frame that held two commands is the bug
    :func:`assert_single_command` exists to prevent. Call
    :func:`assert_read_only` for the safety decision.

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


def assert_single_command(command: str) -> str:
    """Return ``command`` stripped, having confirmed it holds ONE asinfo command.

    The asinfo wire format is a multi-command format: a newline delimits a
    batch, and a ``;`` delimits commands outside the ``:``-argument section.
    A frame whose leading verb is read-only can therefore carry a second,
    unrelated command — so the read-only gate needs this frame-level check
    in addition to the verb check.

    The legitimate single-command shapes all survive:

    * bare verb — ``"namespaces"``, and ``"namespaces;"`` (one trailing
      ``;`` is the canonical terminator)
    * path-style — ``"sets/test/myset"``
    * colon-style — ``"roster:namespace=test"``, and multiple
      ``;``-separated ``key=value`` arguments as in
      ``"latencies:back=10;duration=10"``

    Rejected as multi-command:

    * any internal whitespace once padding is stripped — ``\\n`` (the batch
      separator), ``\\r``, and space / tab (verb terminators, so the verb
      check would read only the text ahead of them)
    * a ``;`` ahead of the ``:``, which cannot be an argument separator
      because the argument section has not started
    * a second ``:``, i.e. a further colon-style command riding in the
      argument section
    * a ``;``-separated argument segment that is not ``key=value``, i.e. a
      bare verb riding in the argument section

    Raises:
        InfoCommandNotSingle: the frame holds more than one command.
        InfoVerbNotAllowed: the frame is empty or whitespace-only (empty
            verb), matching :func:`extract_verb`.
    """
    cmd = command.strip()
    if not cmd:
        raise InfoVerbNotAllowed("")

    # Surrounding padding is already gone, so any whitespace left is internal.
    for ch in cmd:
        if ch.isspace():
            name = _SEPARATOR_NAMES.get(ch, "whitespace")
            raise InfoCommandNotSingle(f"embedded {name} — an asinfo command separator")

    # One trailing ';' terminates a single command, so take it off before
    # reasoning about the separators that remain.
    body = cmd[:-1] if cmd.endswith(";") else cmd
    head, colon, args = body.partition(":")

    # No argument section has started yet, so a ';' here separates commands.
    # With no ':' at all (bare or path-style), head is the whole command and
    # this same check covers it.
    if ";" in head:
        raise InfoCommandNotSingle("';' before the ':' argument separator")
    if not colon:
        return cmd

    if ":" in args:
        raise InfoCommandNotSingle("second ':' verb separator inside the argument section")
    segments = args.split(";")
    # A lone segment is either `key=value` or the single bare argument form
    # (`namespace:test`). Two or more means the ';' is acting as an argument
    # separator, which only holds if every segment really is an argument.
    if len(segments) > 1 and not all("=" in s for s in segments):
        raise InfoCommandNotSingle("';'-separated segment that is not a key=value argument")
    return cmd


class ValidatedInfoCommand(NamedTuple):
    """An asinfo command that passed the read-only gate.

    ``command`` is the string callers must put on the wire. Returning it —
    rather than just the verb — is defence in depth, not a guarantee: this
    is a plain NamedTuple with no validating constructor, so an instance can
    still be built by hand around any string. What it buys is that a caller
    following the signature no longer has to *remember* to transmit the
    validated value, which is exactly the mistake that let a rejected suffix
    reach the cluster.

    ``verb`` is the parsed leading verb, kept for telemetry (OTel span
    attributes, structured log fields) so callers need not re-parse.
    """

    command: str
    verb: str


def assert_read_only(command: str) -> ValidatedInfoCommand:
    """Validate ``command`` as a single, whitelisted read-only asinfo command.

    Two independent checks, both of which must pass:

    1. :func:`assert_single_command` — the frame holds exactly one command,
       so the verb decides the safety of the whole frame rather than just
       of its head.
    2. the leading verb is on :data:`READ_ONLY_INFO_VERBS`.

    Returns a :class:`ValidatedInfoCommand`; transmit ``.command``, never
    the caller's original string. Raises :class:`InfoCommandNotSingle` or
    :class:`InfoVerbNotAllowed` (both :class:`InfoCommandRejected`)
    immediately, so no wire round-trip happens for a rejected command.
    """
    validated = assert_single_command(command)
    verb = extract_verb(validated)
    if verb not in READ_ONLY_INFO_VERBS:
        raise InfoVerbNotAllowed(verb)
    return ValidatedInfoCommand(command=validated, verb=verb)

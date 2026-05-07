"""Unit tests for the read-only asinfo verb whitelist domain module.

Covers:

* :func:`extract_verb` parsing of the three asinfo command shapes
  (bare, ``:``-args, ``/``-path).
* :func:`assert_read_only` allow / block decisions for every verb in the
  whitelist plus a representative set of write / unknown verbs. The
  parametrized "all whitelisted verbs pass" test is the regression net
  that catches accidental whitelist trims.
"""

from __future__ import annotations

import pytest

from aerospike_cluster_manager_api.info_verbs import (
    READ_ONLY_INFO_VERBS,
    InfoVerbNotAllowed,
    assert_read_only,
    extract_verb,
)


class TestExtractVerb:
    def test_bare_verb(self) -> None:
        assert extract_verb("namespaces") == "namespaces"

    def test_colon_args(self) -> None:
        assert extract_verb("roster:namespace=test") == "roster"

    def test_colon_multi_args(self) -> None:
        assert extract_verb("latencies:back=10;duration=10") == "latencies"

    def test_slash_path(self) -> None:
        assert extract_verb("sets/test/myset") == "sets"

    def test_slash_namespace(self) -> None:
        assert extract_verb("namespace/test") == "namespace"

    def test_xdr_dc_with_args(self) -> None:
        assert extract_verb("xdr-dc:dc=DC1") == "xdr-dc"

    def test_leading_trailing_whitespace(self) -> None:
        assert extract_verb("  version  ") == "version"

    def test_empty_string_raises(self) -> None:
        with pytest.raises(InfoVerbNotAllowed) as exc:
            extract_verb("")
        assert exc.value.verb == ""

    def test_whitespace_only_raises(self) -> None:
        with pytest.raises(InfoVerbNotAllowed) as exc:
            extract_verb("   \t\n  ")
        assert exc.value.verb == ""


class TestAssertReadOnly:
    @pytest.mark.parametrize("verb", sorted(READ_ONLY_INFO_VERBS))
    def test_every_whitelisted_verb_passes(self, verb: str) -> None:
        # Bare-form must pass for every whitelisted verb. This is the
        # regression net for accidental trims to READ_ONLY_INFO_VERBS.
        assert_read_only(verb)

    def test_whitelist_membership_is_pinned(self) -> None:
        """Force a deliberate decision when adding/removing a verb.

        The expected set is duplicated here on purpose so silent ADDITIONS
        to ``READ_ONLY_INFO_VERBS`` (e.g. a refactor accidentally including
        a write verb) fail loudly here rather than passing the parametrized
        ``test_every_whitelisted_verb_passes`` (which fans out per-member
        and would simply add one more green test for a dangerous addition).
        """
        expected = frozenset(
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
        assert expected == READ_ONLY_INFO_VERBS
        assert len(READ_ONLY_INFO_VERBS) == 24

    def test_colon_args_pass_when_verb_whitelisted(self) -> None:
        assert_read_only("roster:namespace=test")
        assert_read_only("latencies:back=10")
        assert_read_only("namespace:test")

    def test_trailing_semicolon_accepted(self) -> None:
        # ``namespaces;`` is the canonical asinfo CLI form when piping
        # multiple commands. The verb extractor strips the trailing ``;``
        # so the LLM-friendly form passes the whitelist.
        assert assert_read_only("namespaces;") == "namespaces"
        assert assert_read_only("version;") == "version"

    def test_assert_returns_parsed_verb(self) -> None:
        # Forward-compat for telemetry — callers can attach the parsed
        # verb to OTel span attributes / structured logs.
        assert assert_read_only("roster:namespace=test") == "roster"
        assert assert_read_only("sets/test/myset") == "sets"

    def test_slash_path_pass_when_verb_whitelisted(self) -> None:
        assert_read_only("sets/test/myset")
        assert_read_only("namespace/test")
        assert_read_only("sindex/test/idx_name")

    @pytest.mark.parametrize(
        "command",
        [
            "set-config:context=service;migrate-threads=2",
            "truncate-namespace:namespace=test",
            "recluster:",
            "set-roster:namespace=test;nodes=ABCD,EFGH",
            "create-roster:",
            "quiesces",
            "quiesce-undo",
            "sindex-create:ns=test;set=demo",
            "sindex-delete:ns=test;indexname=foo",
        ],
    )
    def test_known_writes_blocked(self, command: str) -> None:
        with pytest.raises(InfoVerbNotAllowed):
            assert_read_only(command)

    @pytest.mark.parametrize(
        "command",
        [
            "frobnicate",
            "Namespaces",  # case-sensitive — capital N is rejected
            "VERSION",
            "eviction",  # excluded conservatively
            "bins",  # deprecated since Aerospike 7.0, removal in 9.x
            "bins/test",
            "xdr-dc",  # XDR not available on CE
            "dc:dc=DC1",  # XDR not available on CE
        ],
    )
    def test_unknown_or_excluded_verb_blocked(self, command: str) -> None:
        # dump-* verbs are covered by ``TestDumpVerbCatalog`` below — keep them
        # out of this parametrize so the dump audit lives in one place.
        with pytest.raises(InfoVerbNotAllowed):
            assert_read_only(command)

    def test_empty_command_blocked(self) -> None:
        with pytest.raises(InfoVerbNotAllowed):
            assert_read_only("")

    def test_error_carries_extracted_verb(self) -> None:
        with pytest.raises(InfoVerbNotAllowed) as exc:
            assert_read_only("recluster:")
        assert exc.value.verb == "recluster"

    def test_error_message_mentions_a_few_allowed_verbs(self) -> None:
        # The wire message points the LLM at the allowed list in lieu of
        # a separate "list allowed verbs" tool. Exact wording is not
        # asserted — just the shape.
        with pytest.raises(InfoVerbNotAllowed) as exc:
            assert_read_only("frobnicate")
        msg = str(exc.value)
        assert "frobnicate" in msg
        assert "execute_info" in msg


# ---------------------------------------------------------------------------
# dump-* verb audit catalog (issue #308)
# ---------------------------------------------------------------------------


# Every ``dump-*`` verb known to CE 8.1 is enumerated here with its category.
# Audit reproduced via ``aerospike/aerospike-server:8.1.2.1`` (see
# ``docs/plans/2026-05-07-execute-info-readonly-whitelist-design.md`` Appendix A
# for the full table including wire response and log-line delta).
#
# Categories:
#   * ``log_only`` — verb is implemented; replies ``ok`` on the wire and
#     dumps actual content to the server log file (cf_info / cf_warning).
#     Excluded from the read-only whitelist because letting a READ_ONLY
#     caller pile up server-log lines is a side-effect, even though the
#     wire response is harmless.
#   * ``not_in_ce_8_1`` — Aerospike rejects the verb with
#     ``ERROR:4:unrecognized command``. Listed here so a future CE
#     release that reintroduces one fails the catalog test until a
#     deliberate include/exclude decision is made.
#
# When CE adds a verb that returns data on the wire (a hypothetical
# ``pure_read`` category), update the audit, add the verb to
# ``READ_ONLY_INFO_VERBS`` (and to ``test_whitelist_membership_is_pinned``),
# and move the entry here. The test below requires every catalog member
# to be rejected by the current whitelist — adding a ``pure_read`` entry
# without whitelisting it would be a contradiction the test catches.
DUMP_VERB_CATALOG: dict[str, str] = {
    # --- implemented in CE 8.1.2.1, wire reply is "ok", content goes to log ---
    "dump-cluster": "log_only",  # 12 log lines: paxos / exchange / cluster state
    "dump-fabric": "log_only",  # 2 log lines: fabric node table
    "dump-hb": "log_only",  # 10 log lines: heartbeat state
    "dump-hlc": "log_only",  # 1 log line: HLC state
    "dump-migrates": "log_only",  # 7 log lines: migration state
    "dump-rw": "log_only",  # 1 log line: "rw_request_hash dump not yet implemented"
    "dump-skew": "log_only",  # 1 log line: cluster-clock-skew
    "dump-wb-summary": "log_only",  # requires :namespace=...;verbose=...; per docs dumps to log
    # --- referenced in older docs / issue #308 body but absent from CE 8.1.2.1 ---
    "dump-msgs": "not_in_ce_8_1",
    "dump-namespace": "not_in_ce_8_1",
    "dump-nsup": "not_in_ce_8_1",
    "dump-paxos": "not_in_ce_8_1",
    "dump-si": "not_in_ce_8_1",
    "dump-smd": "not_in_ce_8_1",
    "dump-stats": "not_in_ce_8_1",
    "dump-tsvc": "not_in_ce_8_1",
    "dump-wb": "not_in_ce_8_1",
    "dump-wr": "not_in_ce_8_1",
}


class TestDumpVerbCatalog:
    """Audit-driven catalog test — see #308 and the design doc Appendix A.

    The catalog is the single source of truth for which dump-* verbs the
    project has reasoned about. Every entry must be rejected by the
    current whitelist; the per-verb category (``log_only`` vs
    ``not_in_ce_8_1``) lives in the catalog as documentation and as a
    forward-compat hook for future CE versions.
    """

    @pytest.mark.parametrize("verb,category", sorted(DUMP_VERB_CATALOG.items()))
    def test_dump_verbs_are_excluded(self, verb: str, category: str) -> None:
        # Catalog membership invariant: every dump-* verb the project has
        # audited is currently excluded from the read-only whitelist,
        # regardless of category. A future contributor who wants to
        # whitelist a dump-* verb must (a) re-run the audit, (b) update
        # the catalog category, AND (c) update READ_ONLY_INFO_VERBS plus
        # the literal pin — this test will fail at step (c) skipped.
        assert verb not in READ_ONLY_INFO_VERBS, (
            f"{verb!r} is in READ_ONLY_INFO_VERBS but DUMP_VERB_CATALOG says "
            f"category={category!r}; either remove it from the whitelist or "
            f"change its catalog category and rerun the dump-* audit."
        )
        # Bare form
        with pytest.raises(InfoVerbNotAllowed):
            assert_read_only(verb)
        # Colon-arg form (most dump-* verbs accept ``:`` even when no args)
        with pytest.raises(InfoVerbNotAllowed):
            assert_read_only(f"{verb}:")

    def test_no_dump_verb_in_whitelist(self) -> None:
        # Stronger global invariant — even a dump-* verb missed by the
        # catalog (e.g. a typo by a future contributor) must not slip
        # into the whitelist. Cheap belt-and-suspenders against the
        # catalog drifting out of date.
        leaked = {v for v in READ_ONLY_INFO_VERBS if v.startswith("dump-")}
        assert leaked == set(), f"dump-* verbs leaked into the whitelist: {sorted(leaked)}"

    @pytest.mark.parametrize("category", sorted({c for c in DUMP_VERB_CATALOG.values()}))
    def test_catalog_categories_are_known(self, category: str) -> None:
        # Defensive: if a future contributor adds a ``pure_read`` entry to
        # the catalog without also adding it to the whitelist, the
        # parametrized test above will fail loudly. This test enumerates
        # the categories the audit currently produces so the set of
        # legal categories stays explicit in code.
        assert category in {"log_only", "not_in_ce_8_1"}

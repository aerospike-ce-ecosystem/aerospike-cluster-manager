"""Unit tests for expression_builder, focused on PK regex/prefix support (#287)."""

from __future__ import annotations

import pytest
from aerospike_py import exp

from aerospike_cluster_manager_api.expression_builder import (
    REGEX_FLAG_ICASE,
    InvalidPkPatternError,
    _build_condition,
    build_expression,
    build_pk_filter_expression,
)
from aerospike_cluster_manager_api.models.query import (
    PK_BIN_PLACEHOLDER,
    PK_OPERATORS,
    BinDataType,
    FilterCondition,
    FilteredQueryRequest,
    FilterGroup,
    FilterOperator,
)


class TestBuildPkFilterExpression:
    def test_prefix_anchors_with_caret_and_escapes_metachars(self):
        # Special regex chars in user input must not be re-interpreted in prefix mode.
        result = build_pk_filter_expression("user.1+", "prefix")
        expected = exp.regex_compare(
            r"^user\.1\+.*",
            REGEX_FLAG_ICASE,
            exp.key(exp.EXP_TYPE_STRING),
        )
        assert result == expected

    def test_regex_passes_pattern_verbatim(self):
        result = build_pk_filter_expression(r".+@example\.com", "regex")
        expected = exp.regex_compare(
            r".+@example\.com",
            REGEX_FLAG_ICASE,
            exp.key(exp.EXP_TYPE_STRING),
        )
        assert result == expected

    def test_unsupported_mode_raises(self):
        with pytest.raises(ValueError, match="Unsupported PK match mode"):
            build_pk_filter_expression("foo", "exact")  # type: ignore[arg-type]

    @pytest.mark.parametrize(
        "bad_pattern",
        ["[unclosed", "(?P<bad>", "*at_start", "(unbalanced"],
    )
    def test_invalid_regex_raises_invalid_pk_pattern_error(self, bad_pattern: str):
        with pytest.raises(InvalidPkPatternError, match="Invalid regex pattern"):
            build_pk_filter_expression(bad_pattern, "regex")

    def test_prefix_mode_does_not_validate_user_pattern(self):
        # Prefix mode escapes the input first, so a "bad" regex is fine
        # because re.escape produces a valid pattern.
        result = build_pk_filter_expression("[unclosed", "prefix")
        expected = exp.regex_compare(
            r"^\[unclosed.*",
            REGEX_FLAG_ICASE,
            exp.key(exp.EXP_TYPE_STRING),
        )
        assert result == expected


class TestBuildConditionPkOperators:
    def test_pk_prefix_routes_through_pk_helper(self):
        cond = FilterCondition(
            bin=PK_BIN_PLACEHOLDER,
            operator=FilterOperator.PK_PREFIX,
            value="acct_",
        )
        result = _build_condition(cond)
        assert result == build_pk_filter_expression("acct_", "prefix")

    def test_pk_regex_routes_through_pk_helper(self):
        cond = FilterCondition(
            bin=PK_BIN_PLACEHOLDER,
            operator=FilterOperator.PK_REGEX,
            value=r"^id-[0-9]+$",
        )
        result = _build_condition(cond)
        assert result == build_pk_filter_expression(r"^id-[0-9]+$", "regex")

    def test_pk_operator_with_non_placeholder_bin_is_rejected_at_model_level(self):
        # The validator on FilterCondition rejects this combination — the
        # expression_builder never sees a malformed condition.
        with pytest.raises(ValueError, match=PK_BIN_PLACEHOLDER):
            FilterCondition(
                bin="some_bin",
                operator=FilterOperator.PK_PREFIX,
                value="x",
            )

    @pytest.mark.parametrize(
        "operator",
        [
            FilterOperator.EQ,
            FilterOperator.GT,
            FilterOperator.REGEX,
            FilterOperator.BETWEEN,
            FilterOperator.EXISTS,
        ],
    )
    def test_placeholder_bin_with_non_pk_operator_is_rejected(self, operator: FilterOperator):
        with pytest.raises(ValueError, match="reserved for PK operators"):
            FilterCondition(
                bin=PK_BIN_PLACEHOLDER,
                operator=operator,
                value="x",
            )

    def test_pk_operator_requires_string_value(self):
        with pytest.raises(ValueError, match="requires a string value"):
            FilterCondition(
                bin=PK_BIN_PLACEHOLDER,
                operator=FilterOperator.PK_PREFIX,
                value=123,  # int, not str
            )

    def test_non_pk_bin_longer_than_15_chars_is_rejected(self):
        with pytest.raises(ValueError, match="at most 15"):
            FilterCondition(
                bin="x" * 16,
                operator=FilterOperator.EQ,
                value="v",
            )


class TestPkOperatorsConstant:
    """Drift guard — every FilterOperator name starting with PK_ must be in
    PK_OPERATORS, and vice versa. Catches the common mistake of adding a new
    PK operator to the enum without updating the classifier."""

    def test_pk_operators_matches_enum_names(self):
        derived = {op for op in FilterOperator if op.name.startswith("PK_")}
        assert derived == set(PK_OPERATORS)


class TestFilteredQueryRequestPkValidation:
    """C2 + I4 — request-level PK field invariants."""

    def test_prefix_mode_with_no_pattern_is_rejected(self):
        with pytest.raises(ValueError, match="non-empty pk_pattern"):
            FilteredQueryRequest(namespace="test", set="demo", pk_match_mode="prefix")

    def test_regex_mode_with_blank_pattern_is_rejected(self):
        with pytest.raises(ValueError, match="non-empty pk_pattern"):
            FilteredQueryRequest(namespace="test", set="demo", pk_pattern="   ", pk_match_mode="regex")

    def test_pk_pattern_and_primary_key_simultaneously_is_rejected(self):
        with pytest.raises(ValueError, match="not both"):
            FilteredQueryRequest(
                namespace="test",
                set="demo",
                pk_pattern="a",
                primary_key="b",
            )

    def test_legacy_primary_key_with_non_exact_mode_is_rejected(self):
        with pytest.raises(ValueError, match="primary_key only supports"):
            FilteredQueryRequest(
                namespace="test",
                set="demo",
                primary_key="a",
                pk_match_mode="prefix",
            )

    def test_default_request_with_no_pk_fields_is_valid(self):
        # Pure bin-filter request: pk_match_mode defaults to "exact" but
        # neither pk_pattern nor primary_key is set — must not be rejected.
        req = FilteredQueryRequest(namespace="test", set="demo")
        assert req.pk_pattern is None
        assert req.primary_key is None
        assert req.pk_match_mode == "exact"


class TestBuildExpressionWithPkConditions:
    def test_pk_condition_combines_with_bin_filter_via_and(self):
        group = FilterGroup(
            logic="and",
            conditions=[
                FilterCondition(
                    bin=PK_BIN_PLACEHOLDER,
                    operator=FilterOperator.PK_PREFIX,
                    value="usr_",
                ),
                FilterCondition(
                    bin="age",
                    operator=FilterOperator.GT,
                    value=21,
                    bin_type=BinDataType.INTEGER,
                ),
            ],
        )
        expr = build_expression(group)
        # Top-level operator should be AND with two children.
        # exp.and_ returns a dict with a known structure — assert it composes.
        pk_part = build_pk_filter_expression("usr_", "prefix")
        bin_part = exp.gt(exp.int_bin("age"), exp.int_val(21))
        assert expr == exp.and_(pk_part, bin_part)

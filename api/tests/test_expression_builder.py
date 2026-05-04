"""Unit tests for expression_builder, focused on PK regex/prefix support (#287)."""

from __future__ import annotations

import pytest
from aerospike_py import exp

from aerospike_cluster_manager_api.expression_builder import (
    REGEX_FLAG_ICASE,
    _build_condition,
    build_expression,
    build_pk_filter_expression,
)
from aerospike_cluster_manager_api.models.query import (
    PK_BIN_PLACEHOLDER,
    BinDataType,
    FilterCondition,
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

    def test_placeholder_bin_with_non_pk_operator_is_rejected(self):
        with pytest.raises(ValueError, match=PK_BIN_PLACEHOLDER):
            FilterCondition(
                bin=PK_BIN_PLACEHOLDER,
                operator=FilterOperator.EQ,
                value="x",
            )


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

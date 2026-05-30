"""Unit tests for shared utility helpers."""

import pytest

from aerospike_cluster_manager_api.utils import parse_host_port


@pytest.mark.parametrize(
    ("host_str", "expected"),
    [
        ("localhost", ("localhost", 3000)),
        ("host.example:3100", ("host.example", 3100)),
        ("127.0.0.1", ("127.0.0.1", 3000)),
        ("127.0.0.1:4000", ("127.0.0.1", 4000)),
        # Bare IPv6 literals: must stay intact, never split on their own colons.
        ("::1", ("::1", 3000)),
        ("2001:db8::1", ("2001:db8::1", 3000)),
        ("0:0:0:0:0:0:0:1", ("0:0:0:0:0:0:0:1", 3000)),
        # Bracketed IPv6: strip brackets, honor optional :port.
        ("[::1]", ("::1", 3000)),
        ("[::1]:3100", ("::1", 3100)),
        ("[2001:db8::1]:3000", ("2001:db8::1", 3000)),
    ],
)
def test_parse_host_port(host_str: str, expected: tuple[str, int]):
    assert parse_host_port(host_str, 3000) == expected

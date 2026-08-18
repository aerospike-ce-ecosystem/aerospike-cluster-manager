"""Integration tests for ``POST /clusters/{conn_id}/info``.

Drives the FastAPI surface end-to-end (httpx ASGITransport) so the test
covers wiring + body validation + service composition. The matching
service-layer unit tests for the underlying ``execute_info`` /
``execute_info_on_node`` / ``execute_info_read_only`` primitives live in
``test_clusters_service.py``.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api import config
from aerospike_cluster_manager_api.main import app
from aerospike_cluster_manager_api.rate_limit import limiter
from aerospike_cluster_manager_api.services.info_cache import info_cache


def _info_all_result(name: str, resp: str, err: int | None = None) -> tuple[str, int | None, str]:
    """Mirror ``aerospike_py.types.InfoNodeResult`` tuple shape used by ``info_all``."""
    return (name, err, resp)


def _make_mock_client() -> AsyncMock:
    """Build a mock AsyncClient with distinct per-node responses.

    Distinct ``node_marker_X`` payloads ensure tests that filter on
    ``node`` actually exercise the filter — identical payloads would
    let a "returns first result" bug pass silently.
    """
    mock = AsyncMock()
    mock.get_node_names = Mock(return_value=["BB9020011AC4202", "BB9020012AC4202"])
    mock.is_connected.return_value = True

    def info_all_side_effect(cmd: str):
        if cmd == "build":
            return [
                _info_all_result("BB9020011AC4202", "8.1.0.0"),
                _info_all_result("BB9020012AC4202", "8.1.0.0"),
            ]
        if cmd == "version":
            return [
                _info_all_result("BB9020011AC4202", "8.1.0.0"),
                _info_all_result("BB9020012AC4202", "8.1.0.0"),
            ]
        if cmd == "namespaces":
            return [
                _info_all_result("BB9020011AC4202", "test;bar"),
                _info_all_result("BB9020012AC4202", "test;bar"),
            ]
        if cmd == "statistics":
            return [
                _info_all_result("BB9020011AC4202", "node1_marker;cluster_size=2"),
                _info_all_result("BB9020012AC4202", "node2_marker;cluster_size=2"),
            ]
        return []

    mock.info_all.side_effect = info_all_side_effect
    return mock


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


@pytest.fixture()
async def client(init_test_db):
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan
    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


@pytest.fixture(autouse=True)
async def _clear_cache():
    await info_cache.clear()
    yield
    await info_cache.clear()


@pytest.fixture()
def allow_info_write(monkeypatch):
    """Opt the asinfo write passthrough on for one test (#467).

    Off is the default and is itself asserted by
    ``TestExecuteInfoWriteGate.test_write_path_is_403_when_flag_is_off`` —
    every test that wants to reach the verb allowlist has to say so.
    """
    monkeypatch.setattr(config, "ACM_ALLOW_INFO_WRITE", True)


@pytest.fixture()
def enforce_rate_limits():
    """Re-enable the limiter that the ``client`` fixture switches off.

    The suite runs with ``app.state.limiter.enabled = False`` so unrelated
    tests never bump the 60/minute global default. A test that is *about* a
    limit has to turn it back on, and clear the storage first so it does not
    inherit hits from whatever ran before it in the same wall-clock minute.
    """
    limiter.limiter.storage.reset()
    previous = limiter.enabled
    limiter.enabled = True
    yield
    limiter.enabled = previous
    limiter.limiter.storage.reset()


class TestExecuteInfoSingleNodeReadOnly:
    """``node`` set + readOnly=true — exercises execute_info_read_only path."""

    @pytest.mark.asyncio
    async def test_happy_path_returns_response_per_command(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["build", "namespaces"],
                    "node": "BB9020011AC4202",
                    "readOnly": True,
                },
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        results = data["results"]
        assert len(results) == 2

        by_cmd = {r["command"]: r for r in results}
        assert by_cmd["build"]["node"] == "BB9020011AC4202"
        assert by_cmd["build"]["output"] == "8.1.0.0"
        assert by_cmd["build"]["error"] is None

        assert by_cmd["namespaces"]["node"] == "BB9020011AC4202"
        assert by_cmd["namespaces"]["output"] == "test;bar"
        assert by_cmd["namespaces"]["error"] is None

    @pytest.mark.asyncio
    async def test_unknown_node_yields_error_row(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["build"],
                    "node": "ghost-node",
                    "readOnly": True,
                },
            )

        # Per-node failure is reported per-row, not as an overall HTTP error.
        assert resp.status_code == 200, resp.text
        row = resp.json()["results"][0]
        assert row["command"] == "build"
        assert row["node"] == "ghost-node"
        assert row["output"] == ""
        assert row["error"] is not None


class TestExecuteInfoWhitelistRejection:
    """readOnly=true gate must reject ANY non-whitelisted command up-front."""

    @pytest.mark.asyncio
    async def test_set_config_rejected_with_400(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["set-config:context=service;migrate-threads=2"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        assert "set-config" in detail
        assert "read-only whitelist" in detail
        assert "readOnly=false" in detail
        # Wire was NOT touched — fail-fast before any info_all call.
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_one_bad_verb_fails_the_whole_batch(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["build", "recluster:"],  # second is mutation
                    "readOnly": True,
                },
            )

        assert resp.status_code == 400, resp.text
        assert "recluster" in resp.json()["detail"]
        # Even the first (valid) command must not run — atomic batch rejection.
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_multi_command_frame_rejected_with_400(self, client: AsyncClient, sample_connection):
        # asinfo is a multi-command wire format, so a frame whose LEADING
        # verb is whitelisted can carry a further command behind a newline.
        # Checking only the head accepted the frame and then transmitted it
        # whole; the gate must reject the frame instead.
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["namespaces\nrecluster:"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 400, resp.text
        detail = resp.json()["detail"]
        assert "not a single asinfo command" in detail
        # Wire was NOT touched — fail-fast before any info_all call.
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_semicolon_chained_frame_rejected_with_400(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["namespaces;recluster:"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 400, resp.text
        assert "not a single asinfo command" in resp.json()["detail"]
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_fan_out_transmits_the_validated_string(self, client: AsyncClient, sample_connection):
        # The fan-out branch is the default (no `node`) and used to forward
        # body.commands rather than the validated string, so validation had
        # no bearing on what reached the wire. Whitespace padding is the
        # observable proxy: only the validated (stripped) form may be sent.
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["  namespaces  "], "readOnly": True},
            )

        assert resp.status_code == 200, resp.text
        sent = [c.args[0] for c in mock_as_client.info_all.call_args_list]
        assert sent == ["namespaces"]

    @pytest.mark.asyncio
    async def test_readonly_false_allows_allowlisted_write_verb(
        self, client: AsyncClient, sample_connection, allow_info_write
    ):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()
        # Simulate set-config response
        mock_as_client.info_all.side_effect = lambda cmd: [
            _info_all_result("BB9020011AC4202", "ok"),
            _info_all_result("BB9020012AC4202", "ok"),
        ]

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["set-config:context=service;migrate-threads=2"],
                    "readOnly": False,
                },
            )

        assert resp.status_code == 200, resp.text
        # Fan-out: two nodes -> two rows.
        rows = resp.json()["results"]
        assert len(rows) == 2
        assert all(r["output"] == "ok" for r in rows)
        assert all(r["error"] is None for r in rows)


class TestExecuteInfoWriteGate:
    """``readOnly=false`` is an opt-in, allowlisted, rate-limited path (#467).

    It used to be the *absence* of a gate: any string the caller supplied was
    forwarded to ``info_all``, unauthenticated in the default configuration,
    with no rate limit. Each test below pins one of the three checks that now
    stand between a caller and the wire.
    """

    @pytest.mark.asyncio
    async def test_write_path_is_403_when_flag_is_off(self, client: AsyncClient, sample_connection):
        """Default configuration refuses the write path outright."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["set-config:context=service;migrate-threads=2"], "readOnly": False},
            )

        assert resp.status_code == 403, resp.text
        assert "ACM_ALLOW_INFO_WRITE" in resp.json()["detail"]
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_read_path_unaffected_by_the_flag(self, client: AsyncClient, sample_connection):
        """The 403 is scoped to writes — diagnostics keep working by default."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["namespaces"], "readOnly": True},
            )

        assert resp.status_code == 200, resp.text

    @pytest.mark.asyncio
    async def test_destructive_verb_rejected_with_400(self, client: AsyncClient, sample_connection, allow_info_write):
        """The verb that motivated #467: namespace truncation is data loss."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["truncate-namespace:namespace=test"], "readOnly": False},
            )

        assert resp.status_code == 400, resp.text
        assert "truncate-namespace" in resp.json()["detail"]
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_write_verb_rejected_with_400(self, client: AsyncClient, sample_connection, allow_info_write):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["some-verb-nobody-audited:x=1"], "readOnly": False},
            )

        assert resp.status_code == 400, resp.text
        assert "write allowlist" in resp.json()["detail"]
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_write_path_rejects_multi_command_frame(
        self, client: AsyncClient, sample_connection, allow_info_write
    ):
        """A whitelisted head must not smuggle a destructive tail.

        Without the single-command check, the verb gate would inspect
        ``set-config`` and forward the whole frame — truncating the namespace.
        """
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["set-config:context=service;migrate-threads=2\ntruncate-namespace:namespace=test"],
                    "readOnly": False,
                },
            )

        assert resp.status_code == 400, resp.text
        assert "not a single asinfo command" in resp.json()["detail"]
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_batch_is_atomic_one_bad_verb_blocks_all(
        self, client: AsyncClient, sample_connection, allow_info_write
    ):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["recluster:", "truncate-namespace:namespace=test"],
                    "readOnly": False,
                },
            )

        assert resp.status_code == 400, resp.text
        # The legal first command must not have run either.
        mock_as_client.info_all.assert_not_called()

    @pytest.mark.asyncio
    async def test_write_path_is_rate_limited(
        self, client: AsyncClient, sample_connection, allow_info_write, enforce_rate_limits
    ):
        """5/minute, and it is charged even for rejected commands.

        Charging before validation is deliberate: otherwise the allowlist
        itself becomes a free oracle — a caller could enumerate which verbs a
        deployment would accept at the 60/minute global rate.
        """
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()
        mock_as_client.info_all.side_effect = lambda cmd: [_info_all_result("BB9020011AC4202", "ok")]

        codes: list[int] = []
        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            for _ in range(6):
                resp = await client.post(
                    f"/api/v1/clusters/{sample_connection.id}/info",
                    json={"commands": ["recluster:"], "readOnly": False},
                )
                codes.append(resp.status_code)

        assert codes[:5] == [200] * 5, codes
        assert codes[5] == 429, codes


class TestExecuteInfoFanOut:
    """Node omitted -> fan-out via execute_info / info_all."""

    @pytest.mark.asyncio
    async def test_fan_out_returns_one_row_per_node(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["statistics"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 200, resp.text
        rows = resp.json()["results"]
        # Two nodes -> two rows for the single command.
        assert len(rows) == 2
        node_outputs = {r["node"]: r["output"] for r in rows}
        assert "node1_marker" in node_outputs["BB9020011AC4202"]
        assert "node2_marker" in node_outputs["BB9020012AC4202"]
        assert all(r["error"] is None for r in rows)

    @pytest.mark.asyncio
    async def test_fan_out_marks_per_node_errors(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()
        # node1 errors, node2 succeeds — verify partial-failure surfacing.
        mock_as_client.info_all.side_effect = lambda cmd: [
            _info_all_result("BB9020011AC4202", "", err=1),
            _info_all_result("BB9020012AC4202", "ok", err=None),
        ]

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["build"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 200, resp.text
        rows = {r["node"]: r for r in resp.json()["results"]}
        assert rows["BB9020011AC4202"]["error"] is not None
        assert rows["BB9020012AC4202"]["error"] is None
        assert rows["BB9020012AC4202"]["output"] == "ok"

    @pytest.mark.asyncio
    async def test_multiple_commands_fan_out(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={
                    "commands": ["build", "version"],
                    "readOnly": True,
                },
            )

        assert resp.status_code == 200, resp.text
        rows = resp.json()["results"]
        # 2 commands x 2 nodes = 4 rows
        assert len(rows) == 4
        by_cmd: dict[str, list[dict]] = {}
        for r in rows:
            by_cmd.setdefault(r["command"], []).append(r)
        assert set(by_cmd) == {"build", "version"}
        assert len(by_cmd["build"]) == 2
        assert len(by_cmd["version"]) == 2


class TestExecuteInfoConnNotFound:
    @pytest.mark.asyncio
    async def test_unknown_conn_id_returns_404(self, client: AsyncClient, init_test_db):
        # No connection persisted -> dependency raises 404 before reaching the handler.
        resp = await client.post(
            "/api/v1/clusters/conn-does-not-exist/info",
            json={"commands": ["build"], "readOnly": True},
        )
        assert resp.status_code == 404, resp.text
        assert "conn-does-not-exist" in resp.json()["detail"]


class TestExecuteInfoValidation:
    @pytest.mark.asyncio
    async def test_empty_commands_rejected(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            # Even with a valid conn, an empty commands list should fail Pydantic
            # validation (422) — drives ackoctl to error-out client-side.
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": [], "readOnly": True},
            )
        assert resp.status_code == 422, resp.text

    @pytest.mark.asyncio
    async def test_legacy_api_prefix_also_works(self, client: AsyncClient, sample_connection):
        # Mirror the /api ↔ /api/v1 duality wired in main.py — clients on
        # the unversioned path must still reach the new endpoint.
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            return_value=mock_as_client,
        ):
            resp = await client.post(
                f"/api/clusters/{sample_connection.id}/info",
                json={"commands": ["build"], "readOnly": True},
            )

        assert resp.status_code == 200, resp.text
        assert len(resp.json()["results"]) == 2  # fan-out across 2 nodes


class TestWriteGateRunsBeforeTheConnection:
    """The 403 must precede the client build, not follow it.

    #480 claimed the write gate "runs before the connection is touched". It did
    not: the check lived in the handler body, while ``client: AerospikeClient``
    is a FastAPI dependency, and FastAPI resolves the whole dependency tree
    before the body runs. So a disabled deployment still dialled the cluster and
    still discriminated 404 / 503 / 403 — an inventory-and-reachability oracle,
    unauthenticated under the OIDC_ENABLED=false default. ``consume_budget`` sat
    in the body too, so probes were governed by the 60/minute global rather than
    the 5/minute write budget.
    """

    @pytest.mark.asyncio
    async def test_403_is_raised_without_building_a_client(self, client: AsyncClient, sample_connection):
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_get_client = AsyncMock(return_value=_make_mock_client())

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            mock_get_client,
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["set-config:context=service;migrate-threads=2"], "readOnly": False},
            )

        assert resp.status_code == 403, resp.text
        mock_get_client.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_403_precedes_an_unreachable_cluster_503(self, client: AsyncClient, sample_connection):
        """A dead cluster and a live one must be indistinguishable when writes are off."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            AsyncMock(side_effect=ConnectionRefusedError("cluster is down")),
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["set-config:context=service;migrate-threads=2"], "readOnly": False},
            )

        assert resp.status_code == 403, resp.text

    @pytest.mark.asyncio
    async def test_403_precedes_a_missing_connection_404(self, client: AsyncClient):
        """Nor may it discriminate which connection ids exist.

        The 403 discloses only the server's own config flag, which is not
        per-tenant information; a 404 here would confirm the id is unknown and
        turn the route into a connection-inventory oracle.
        """
        resp = await client.post(
            "/api/v1/clusters/conn-does-not-exist/info",
            json={"commands": ["set-config:context=service;migrate-threads=2"], "readOnly": False},
        )
        assert resp.status_code == 403, resp.text

    @pytest.mark.asyncio
    async def test_read_path_still_reaches_the_cluster(self, client: AsyncClient, sample_connection):
        """The gate must not short-circuit the diagnostics path it does not govern."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            AsyncMock(return_value=mock_as_client),
        ):
            resp = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["namespaces"], "readOnly": True},
            )

        assert resp.status_code == 200, resp.text
        mock_as_client.info_all.assert_awaited()

    @pytest.mark.asyncio
    async def test_429_also_precedes_the_connection(
        self, client: AsyncClient, sample_connection, allow_info_write, enforce_rate_limits
    ):
        """Exhausted budget must not cost a cluster dial either."""
        from aerospike_cluster_manager_api import db

        await db.create_connection(sample_connection)
        mock_as_client = _make_mock_client()
        mock_as_client.info_all.side_effect = lambda cmd: [_info_all_result("BB9020011AC4202", "ok")]
        mock_get_client = AsyncMock(return_value=mock_as_client)

        with patch(
            "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
            mock_get_client,
        ):
            for _ in range(5):
                ok = await client.post(
                    f"/api/v1/clusters/{sample_connection.id}/info",
                    json={"commands": ["recluster:"], "readOnly": False},
                )
                assert ok.status_code == 200, ok.text
            dialled_before = mock_get_client.await_count

            limited = await client.post(
                f"/api/v1/clusters/{sample_connection.id}/info",
                json={"commands": ["recluster:"], "readOnly": False},
            )

        assert limited.status_code == 429, limited.text
        # The rejected 6th request must not have dialled the cluster.
        assert mock_get_client.await_count == dialled_before

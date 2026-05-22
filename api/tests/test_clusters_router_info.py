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

from aerospike_cluster_manager_api.main import app
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
    async def test_readonly_false_allows_unwhitelisted_verb(self, client: AsyncClient, sample_connection):
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

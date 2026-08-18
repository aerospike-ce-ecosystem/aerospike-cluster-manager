"""The namespace that reaches an info command must be a single safe frame.

``info_verbs`` rejects a chained frame on ``POST /clusters/{id}/info`` (#469),
but the four builders in :mod:`constants` interpolate a namespace into an info
command on routes that never call that gate -- ``GET /records/{id}?ns=...`` and
the index routes. ``\n`` is the batch separator, so an unvalidated namespace of
``test\ntruncate:namespace=test`` is a two-command frame whose head is a read.

These tests pin both halves: the builders refuse it, and the routes refuse it
before a client is ever asked to send anything.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aerospike_cluster_manager_api.constants import (
    InvalidInfoArgument,
    info_bins,
    info_namespace,
    info_sets,
    info_sindex,
)
from aerospike_cluster_manager_api.main import app

BUILDERS = [info_namespace, info_sets, info_sindex, info_bins]

# The reproduced payload, plus the neighbouring shapes the same hole allows.
CHAINED = [
    "test\ntruncate:namespace=test",
    "test\rtruncate:namespace=test",
    "test;truncate:namespace=test",
    "test truncate:namespace=test",
    "test/truncate:namespace=test",
    "test:truncate",
    "a" * 32,  # past the server's 31-character namespace limit
    "",
]


class TestBuildersRefuseAChainedFrame:
    @pytest.mark.parametrize("builder", BUILDERS, ids=lambda b: b.__name__)
    @pytest.mark.parametrize("ns", CHAINED)
    def test_rejected(self, builder, ns: str) -> None:
        with pytest.raises(InvalidInfoArgument):
            builder(ns)

    @pytest.mark.parametrize("builder", BUILDERS, ids=lambda b: b.__name__)
    @pytest.mark.parametrize("ns", ["test", "bar-1", "my_ns", "a", "a" * 31])
    def test_real_namespace_names_still_build(self, builder, ns: str) -> None:
        assert builder(ns).endswith(f"/{ns}")

    def test_the_error_is_a_value_error(self) -> None:
        # The routers' existing `except ValueError` branches turn this into a
        # 400 rather than a 500.
        assert issubclass(InvalidInfoArgument, ValueError)


@asynccontextmanager
async def _noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


@pytest.fixture()
async def client():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan
    app.state.limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.state.limiter.enabled = True
    app.router.lifespan_context = original_lifespan


class TestChainedNamespaceNeverReachesTheWire:
    """The end-to-end shape: the request is refused, and nothing is sent."""

    @pytest.mark.parametrize("ns", ["test\ntruncate:namespace=test", "test;truncate"])
    async def test_records_listing_is_refused_without_calling_info(self, client: AsyncClient, ns: str) -> None:
        mock_client = AsyncMock()
        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.get(
                "/api/records/conn-test",
                params={"ns": ns, "set": "s1"},
            )

        assert response.status_code >= 400, response.text
        # The assertion that matters: no frame was handed to the client at all.
        mock_client.info_all.assert_not_awaited()
        mock_client.info_random_node.assert_not_awaited()

    async def test_filter_route_is_refused_without_calling_info(self, client: AsyncClient) -> None:
        mock_client = AsyncMock()
        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.post(
                "/api/records/conn-test/filter",
                json={"namespace": "test\ntruncate:namespace=test", "set": "s1"},
            )

        assert response.status_code >= 400, response.text
        mock_client.info_all.assert_not_awaited()

    async def test_index_delete_is_refused_without_calling_info(self, client: AsyncClient) -> None:
        # `DELETE /indexes/{id}` is the caller-controlled index path -- the GET
        # takes no `ns` at all, it enumerates namespaces from the server. The
        # delete reaches `_index_exists` -> `info_sindex(ns)` on its error path.
        mock_client = AsyncMock()
        with (
            patch(
                "aerospike_cluster_manager_api.dependencies.db.get_connection",
                AsyncMock(return_value={"id": "conn-test"}),
            ),
            patch(
                "aerospike_cluster_manager_api.dependencies.client_manager.get_client",
                AsyncMock(return_value=mock_client),
            ),
        ):
            response = await client.delete(
                "/api/indexes/conn-test",
                params={"ns": "test\ntruncate:namespace=test", "name": "idx1"},
            )

        assert response.status_code >= 400, response.text
        mock_client.info_random_node.assert_not_awaited()

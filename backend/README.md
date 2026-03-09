# Aerospike Cluster Manager — Backend API

FastAPI REST API backend for Aerospike database management.

## Tech Stack

- **Framework**: FastAPI
- **Runtime**: Python 3.13
- **Package Manager**: uv
- **Aerospike Client**: aerospike-py 0.0.1a6
- **Linting**: Ruff

## Development

```bash
uv sync                    # Install dependencies
uv run uvicorn aerospike_cluster_manager_api.main:app --reload  # Start dev server on port 8000
```

Requires an Aerospike server. Use `podman compose -f compose.dev.yaml up -d` to start a local 3-node cluster.

```bash
# Set environment for local dev
export AEROSPIKE_HOST=localhost
export AEROSPIKE_PORT=14790
```

## API Endpoints

| Prefix | Description |
|--------|-------------|
| `GET /api/health` | Health check |
| `/api/connections` | Connection profile CRUD |
| `/api/clusters/{conn_id}` | Cluster info, nodes, namespaces |
| `/api/records/{conn_id}` | Record CRUD operations |
| `/api/query/{conn_id}` | Query/scan execution |
| `/api/indexes/{conn_id}` | Secondary index management |
| `/api/admin/users/{conn_id}` | User management (Enterprise) |
| `/api/admin/roles/{conn_id}` | Role management (Enterprise) |
| `/api/udfs/{conn_id}` | UDF management |
| `/api/terminal/{conn_id}` | AQL terminal |
| `/api/metrics/{conn_id}` | Metrics & monitoring |
| `/api/k8s/clusters` | K8s AerospikeCluster lifecycle (CRUD, scale, operations, HPA) |
| `/api/k8s/templates` | K8s AerospikeClusterTemplate management |
| `/api/k8s/namespaces` | K8s namespace listing |
| `/api/k8s/storageclasses` | K8s storage class listing |
| `/api/k8s/secrets` | K8s secret listing (ACL picker) |
| `/api/k8s/nodes` | K8s node listing (rack config) |

Interactive API docs available at `http://localhost:8000/docs` (Swagger UI).

> K8s endpoints require `K8S_MANAGEMENT_ENABLED=true`. See the [main README](../README.md#k8s-api-endpoints) for the full endpoint reference.

## Linting

```bash
uv run ruff check src --fix    # Lint + autofix
uv run ruff format src         # Format
```

## Project Structure

```
src/aerospike_cluster_manager_api/
├── main.py          # FastAPI app, CORS, middleware
├── config.py        # Environment configuration
├── client_manager.py# Aerospike client lifecycle
├── converters.py    # Record type converters
├── info_parser.py   # Aerospike info command parser
├── models/          # Pydantic request/response models
├── routers/         # REST endpoint handlers
└── mock_data/       # Development mock data
```

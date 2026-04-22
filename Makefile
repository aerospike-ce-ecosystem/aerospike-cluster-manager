# Makefile — Task runner for Aerospike Cluster Manager
# Usage: make <target>

.PHONY: dev dev-up dev-down up down test test-backend test-frontend \
        lint lint-backend lint-frontend type-check build pre-commit clean \
        run-local run-local-down run-local-ui run-local-ui-local-build \
        kind-up kind-down kind-status \
        acko-install acko-uninstall acko-verify \
        build-ui-images

# ---------------------------------------------------------------------------
# Podman Compose — development (Aerospike only)
# ---------------------------------------------------------------------------

dev: dev-up
	@echo ""
	@echo "Aerospike dev cluster is running."
	@echo "Start the backend:   cd backend  && AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790 uv run uvicorn aerospike_cluster_manager_api.main:app --reload"
	@echo "Start the frontend:  cd frontend && npm run dev"

dev-up:
	podman compose -f compose.dev.yaml up -d

dev-down:
	podman compose -f compose.dev.yaml down

# ---------------------------------------------------------------------------
# Podman Compose — full stack
# ---------------------------------------------------------------------------

up:
	podman compose -f compose.yaml up --build

down:
	podman compose -f compose.yaml down

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest tests/ -v --tb=short

test-frontend:
	cd frontend && npm run test

# ---------------------------------------------------------------------------
# Linting & formatting
# ---------------------------------------------------------------------------

lint: lint-backend lint-frontend

lint-backend:
	cd backend && uv run ruff check src --fix && uv run ruff format src

lint-frontend:
	cd frontend && npm run lint:fix && npm run format

# ---------------------------------------------------------------------------
# Type checking & build
# ---------------------------------------------------------------------------

type-check:
	cd frontend && npm run type-check

build:
	cd frontend && npm run build

# ---------------------------------------------------------------------------
# Pre-commit & cleanup
# ---------------------------------------------------------------------------

pre-commit:
	pre-commit run --all-files

clean:
	podman compose -f compose.yaml down 2>/dev/null || true
	podman compose -f compose.dev.yaml down 2>/dev/null || true

# ---------------------------------------------------------------------------
# Local K8s / ACKO development (kind + cert-manager + ACKO operator)
# ---------------------------------------------------------------------------
# Single entry point for ACKO UI development. Boots kind (podman provider),
# installs the ACKO operator, and starts Aerospike via compose.dev.yaml.
# backend/frontend are NOT started automatically — run-local prints the
# commands to paste into two separate terminals for hot-reload development.

run-local:
	bash scripts/local-dev/run-local.sh

# Same as run-local, but also deploys the chart-bundled UI (backend + legacy
# frontend + frontend-renewal) inside kind. Uses public ghcr images by default.
run-local-ui:
	ACKO_UI_ENABLED=true bash scripts/local-dev/run-local.sh

# Variant that builds the 3 UI images from this repo's Dockerfiles and loads
# them into kind (for testing uncommitted UI changes).
run-local-ui-local-build:
	ACKO_UI_ENABLED=true ACKO_UI_LOCAL_BUILD=true bash scripts/local-dev/run-local.sh

run-local-down:
	bash scripts/local-dev/run-local-down.sh

build-ui-images:
	bash scripts/local-dev/build-ui-images.sh

kind-up:
	bash scripts/local-dev/kind-up.sh

kind-down:
	bash scripts/local-dev/kind-down.sh

kind-status:
	kubectl cluster-info --context kind-kind
	kubectl get nodes -L topology.kubernetes.io/zone --context kind-kind

acko-install:
	bash scripts/local-dev/acko-install.sh

acko-uninstall:
	bash scripts/local-dev/acko-uninstall.sh

acko-verify:
	kubectl get crd --context kind-kind | grep acko.io
	kubectl -n aerospike-operator get pods --context kind-kind

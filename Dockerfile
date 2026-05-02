# =============================================================================
# Stage 1: UI build (Next.js standalone + proxy.js sidecar)
# =============================================================================
FROM node:22-alpine AS ui-deps
WORKDIR /app
COPY ui/package.json ui/package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:22-alpine AS ui-builder
WORKDIR /app
COPY --from=ui-deps /app/node_modules ./node_modules
COPY ui/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =============================================================================
# Stage 2: API build
# =============================================================================
FROM python:3.14-slim AS api-builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app/api

COPY api/pyproject.toml api/uv.lock api/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api/src/ src/
RUN uv sync --frozen --no-dev

# =============================================================================
# Stage 3a: Backend-only runtime (FastAPI on :8000)
# Used by ACKO helm chart `ui.api` deployment. Equivalent to
# `cd backend && uv run uvicorn aerospike_cluster_manager_api.main:app`.
# =============================================================================
FROM python:3.13-slim AS backend

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=backend-builder /app/backend /app/backend

WORKDIR /app/backend

RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid appuser --shell /bin/false --create-home appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app /app/backend \
    && chmod 755 /app/data

USER appuser

ENV SQLITE_PATH=/app/data/connections.db
ENV PATH="/app/backend/.venv/bin:${PATH}"

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8000/api/health || exit 1

ENTRYPOINT ["uv", "run", "--no-sync", "uvicorn", "aerospike_cluster_manager_api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# =============================================================================
# Stage 3: Production runtime (Python + Node.js — combined for podman compose)
# =============================================================================
FROM python:3.14-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy api
COPY --from=api-builder /app/api /app/api

# Copy ui (Next.js standalone + proxy.js sidecar)
COPY --from=ui-builder /app/public /app/ui/public
COPY --from=ui-builder /app/.next/standalone /app/ui
COPY --from=ui-builder /app/.next/static /app/ui/.next/static
COPY --from=ui-builder /app/proxy.js /app/ui/proxy.js

# Copy entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create non-root user
RUN groupadd --gid 1001 appuser \
    && useradd --uid 1001 --gid appuser --shell /bin/false --create-home appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app \
    && chmod 755 /app/data

USER appuser

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SQLITE_PATH=/app/data/connections.db

# UI: 3100, API: 8000
EXPOSE 3100 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

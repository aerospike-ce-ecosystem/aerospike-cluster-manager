from __future__ import annotations

import os


def _get_int(name: str, default: int) -> int:
    """Parse an integer environment variable with validation."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"Environment variable {name} must be an integer, got: {raw!r}") from None


CORS_ORIGINS: list[str] = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3100").split(",") if o.strip()
]

HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = _get_int("PORT", 8000)

ENABLE_POSTGRES: bool = os.getenv("ENABLE_POSTGRES", "false").lower() in ("true", "1", "yes")
SQLITE_PATH: str = os.getenv("SQLITE_PATH", "./data/connections.db")
# Required when ENABLE_POSTGRES=true; set via DATABASE_URL env var
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT: str = os.getenv("LOG_FORMAT", "text")  # "text" or "json"

K8S_MANAGEMENT_ENABLED: bool = os.getenv("K8S_MANAGEMENT_ENABLED", "false").lower() in ("true", "1", "yes")

# Database connection pool
DB_POOL_MIN_SIZE: int = _get_int("DB_POOL_MIN_SIZE", 2)
DB_POOL_MAX_SIZE: int = _get_int("DB_POOL_MAX_SIZE", 10)
DB_COMMAND_TIMEOUT: int = _get_int("DB_COMMAND_TIMEOUT", 30)  # SQL command execution timeout in seconds

# Aerospike client
AS_TEND_INTERVAL: int = _get_int("AS_TEND_INTERVAL", 1000)  # Cluster tend interval in milliseconds

# Kubernetes API
K8S_API_TIMEOUT: int = _get_int("K8S_API_TIMEOUT", 10)
K8S_LOG_TIMEOUT: int = _get_int("K8S_LOG_TIMEOUT", 30)

# SSE (Server-Sent Events) streaming
SSE_ENABLED: bool = os.getenv("SSE_ENABLED", "true").lower() in ("true", "1", "yes")
SSE_HEARTBEAT_INTERVAL: int = _get_int("SSE_HEARTBEAT_INTERVAL", 15)  # seconds between heartbeat pings
SSE_MAX_CONNECTIONS: int = _get_int("SSE_MAX_CONNECTIONS", 50)  # max concurrent SSE subscribers

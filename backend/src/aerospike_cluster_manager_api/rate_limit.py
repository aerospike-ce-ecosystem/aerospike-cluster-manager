from slowapi import Limiter
from starlette.requests import Request

from aerospike_cluster_manager_api import config


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For only from trusted proxies."""
    client_host = request.client.host if request.client else "127.0.0.1"

    if config.TRUSTED_PROXIES and client_host in config.TRUSTED_PROXIES:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[-1].strip()

    return client_host


limiter = Limiter(key_func=_get_client_ip)

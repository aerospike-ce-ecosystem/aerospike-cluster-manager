from __future__ import annotations

import random
import time
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from aerospike_cluster_manager_api.dependencies import AerospikeClient
from aerospike_cluster_manager_api.models.terminal import TerminalCommand, TerminalRequest
from aerospike_cluster_manager_api.services.terminal_service import execute_terminal_command

router = APIRouter(prefix="/terminal", tags=["terminal"])


@router.post(
    "/{conn_id}",
    summary="Execute terminal command",
    description="Execute an AQL-style terminal command against the Aerospike cluster.",
)
async def execute_command(body: TerminalRequest, client: AerospikeClient) -> TerminalCommand:
    """Execute an AQL-style terminal command against the Aerospike cluster."""
    command = body.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Missing required field: command")

    output, success = await execute_terminal_command(client, command)

    return TerminalCommand(
        id=f"cmd-{int(time.time() * 1000)}-{random.getrandbits(24):06x}",
        command=command,
        output=output,
        timestamp=datetime.now(UTC).isoformat(),
        success=success,
    )

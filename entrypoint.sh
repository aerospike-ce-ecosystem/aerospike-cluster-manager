#!/bin/bash
set -e

# Start API (FastAPI)
cd /app/api
uv run --no-dev uvicorn aerospike_cluster_manager_api.main:app \
    --host 0.0.0.0 --port 8000 &
api_pid=$!

# Start UI (Next.js standalone via proxy.js sidecar)
cd /app/ui
API_URL=http://localhost:8000 HOSTNAME=0.0.0.0 PORT=3100 node proxy.js &
ui_pid=$!

# Forward SIGTERM/SIGINT to child processes
_term() {
  kill -TERM "$api_pid" "$ui_pid" 2>/dev/null
}
trap _term SIGTERM SIGINT

# Wait for any process to exit
wait -n
EXIT_CODE=$?

# Kill remaining processes
kill "$api_pid" "$ui_pid" 2>/dev/null
wait
exit $EXIT_CODE

#!/bin/bash
set -e

# Start backend (FastAPI)
cd /app/backend
uv run --no-dev uvicorn aerospike_cluster_manager_api.main:app \
    --host 0.0.0.0 --port 8000 &
backend_pid=$!

# Start frontend (Next.js)
cd /app/frontend
BACKEND_URL=http://localhost:8000 HOSTNAME=0.0.0.0 PORT=3000 node server.js &
frontend_pid=$!

# Forward SIGTERM/SIGINT to child processes
_term() {
  kill -TERM "$backend_pid" "$frontend_pid" 2>/dev/null
}
trap _term SIGTERM SIGINT

# Wait for any process to exit
wait -n
EXIT_CODE=$?

# Kill remaining processes
kill "$backend_pid" "$frontend_pid" 2>/dev/null
wait
exit $EXIT_CODE

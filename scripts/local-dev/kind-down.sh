#!/usr/bin/env bash
# Delete the local kind cluster. Idempotent.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_bin kind
require_bin "${KIND_PROVIDER}"

if kind_cluster_exists; then
  log "Deleting kind cluster '${KIND_CLUSTER_NAME}'..."
  kind delete cluster --name "${KIND_CLUSTER_NAME}"
  ok "kind cluster '${KIND_CLUSTER_NAME}' deleted"
else
  ok "kind cluster '${KIND_CLUSTER_NAME}' does not exist — nothing to do"
fi

#!/usr/bin/env bash
# Create a local kind cluster (podman provider by default). Idempotent.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_local_dev_bins

if [[ ! -f "${KIND_CONFIG_FILE}" ]]; then
  die "kind config not found: ${KIND_CONFIG_FILE}"
fi

if kind_cluster_exists; then
  ok "kind cluster '${KIND_CLUSTER_NAME}' already exists — skipping create"
else
  log "Creating kind cluster '${KIND_CLUSTER_NAME}' via ${KIND_PROVIDER}..."
  kind create cluster --name "${KIND_CLUSTER_NAME}" --config "${KIND_CONFIG_FILE}"
  ok "kind cluster created"
fi

log "Switching kubectl context to '${KIND_CONTEXT}'"
kubectl config use-context "${KIND_CONTEXT}" >/dev/null

log "Waiting for all nodes to be Ready..."
kubectl wait --for=condition=Ready nodes --all --timeout=120s >/dev/null

ok "kind cluster '${KIND_CLUSTER_NAME}' is ready (provider: ${KIND_PROVIDER}, context: ${KIND_CONTEXT})"
kubectl get nodes -L topology.kubernetes.io/zone

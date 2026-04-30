#!/usr/bin/env bash
# Orchestrator: bootstrap the full local stack for ACKO UI development.
#   1. kind cluster (podman provider)
#   2. cert-manager + ACKO operator (helm)
#   3. Standalone Aerospike (compose.dev.yaml) for non-K8s connection testing
# api/ui are NOT started — instructions are printed for the developer.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_local_dev_bins
require_bin podman "Install: https://podman.io/docs/installation"

log "[1/N] Bootstrapping kind cluster..."
bash "${REPO_ROOT}/scripts/local-dev/kind-up.sh"

if [[ "${ACKO_UI_ENABLED}" == "true" && "${ACKO_UI_LOCAL_BUILD}" == "true" ]]; then
  log "[UI] Building and loading 2 UI images into kind (ACKO_UI_LOCAL_BUILD=true)..."
  bash "${REPO_ROOT}/scripts/local-dev/build-ui-images.sh"
fi

log "[2/N] Installing cert-manager + ACKO operator (ui.enabled=${ACKO_UI_ENABLED})..."
bash "${REPO_ROOT}/scripts/local-dev/acko-install.sh"

log "[3/N] Starting standalone Aerospike via compose.dev.yaml..."
(cd "${REPO_ROOT}" && podman compose -f compose.dev.yaml up -d)
ok "Aerospike dev cluster up (localhost:14790/:14791/:14792)"

cat <<EOF

============================================================
Local stack is ready.
  kubectl context : ${KIND_CONTEXT}
  ACKO operator   : ${ACKO_NAMESPACE}/${ACKO_RELEASE}
  Aerospike seeds : localhost:14790, localhost:14791, localhost:14792
  UI in cluster   : ${ACKO_UI_ENABLED} (local-build: ${ACKO_UI_LOCAL_BUILD})
============================================================
EOF

if [[ "${ACKO_UI_ENABLED}" == "true" ]]; then
  _ui_prefix="${ACKO_FULLNAME_OVERRIDE:-${ACKO_RELEASE}}"
  cat <<EOF
Port-forward the chart-bundled UI:

  # web (Next.js)
  kubectl port-forward -n ${ACKO_NAMESPACE} svc/${_ui_prefix}-ui-web 3100:3100

  # api (if needed separately)
  kubectl port-forward -n ${ACKO_NAMESPACE} svc/${_ui_prefix}-ui-api 8000:80

Then open http://localhost:3100/
EOF
else
  cat <<EOF
Next steps — open two terminals:

  # Terminal A — api
  cd api
  K8S_MANAGEMENT_ENABLED=true \\
  AEROSPIKE_HOST=localhost AEROSPIKE_PORT=14790 \\
    uv run uvicorn aerospike_cluster_manager_api.main:app --reload

  # Terminal B — ui
  cd ui && npm run dev

Then open http://localhost:3100/k8s/clusters
EOF
fi

echo
echo "Teardown: make run-local-down"

#!/usr/bin/env bash
# Teardown counterpart for run-local.sh. Removes Aerospike, ACKO, cert-manager, and kind.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

log "[1/3] Stopping standalone Aerospike (compose.dev.yaml)..."
if command -v podman >/dev/null 2>&1; then
  (cd "${REPO_ROOT}" && podman compose -f compose.dev.yaml down) || warn "compose.dev.yaml down failed"
else
  warn "podman not found — skipping compose.dev.yaml teardown"
fi

log "[2/3] Uninstalling ACKO operator + cert-manager..."
bash "${REPO_ROOT}/scripts/local-dev/acko-uninstall.sh" || warn "ACKO uninstall step reported an error"

log "[3/3] Deleting kind cluster..."
bash "${REPO_ROOT}/scripts/local-dev/kind-down.sh"

ok "Teardown complete."

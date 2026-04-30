#!/usr/bin/env bash
# Build the 2 Aerospike Cluster Manager UI images locally and load them into
# the kind cluster. Used by run-local when ACKO_UI_ENABLED=true.
#
# Images produced (tag defaults to ${ACKO_UI_IMAGE_TAG}, default 'local'):
#   - ${ACKO_UI_API_IMAGE}:${ACKO_UI_IMAGE_TAG}
#   - ${ACKO_UI_WEB_IMAGE}:${ACKO_UI_IMAGE_TAG}
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_bin podman
require_bin kind

if ! kind_cluster_exists; then
  die "kind cluster '${KIND_CLUSTER_NAME}' not found — run 'make kind-up' first"
fi

build_and_load() {
  local image="$1"
  local dockerfile="$2"
  local tag="${ACKO_UI_IMAGE_TAG}"

  log "Building ${image}:${tag} (dockerfile: ${dockerfile})..."
  (cd "${REPO_ROOT}" && podman build -t "${image}:${tag}" -f "${dockerfile}" .)

  log "Loading ${image}:${tag} into kind cluster '${KIND_CLUSTER_NAME}'..."
  kind load docker-image "${image}:${tag}" --name "${KIND_CLUSTER_NAME}"
  ok "${image}:${tag} loaded"
}

build_and_load "${ACKO_UI_API_IMAGE}" "Dockerfile.api"
build_and_load "${ACKO_UI_WEB_IMAGE}" "Dockerfile.ui"

ok "All 2 UI images built and loaded into kind"

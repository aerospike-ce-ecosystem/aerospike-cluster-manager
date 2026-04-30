#!/usr/bin/env bash
# Build the 2 Aerospike Cluster Manager UI images locally and load them into
# the kind cluster. Used by run-local when ACKO_UI_ENABLED=true.
#
# Images produced (tag defaults to ${ACKO_UI_IMAGE_TAG}, default 'local'):
#   - ${ACKO_UI_API_IMAGE}:${ACKO_UI_IMAGE_TAG}
#   - ${ACKO_UI_WEB_IMAGE}:${ACKO_UI_IMAGE_TAG}
#
# Loads via `podman save | kind load image-archive` instead of
# `kind load docker-image`. Podman normalizes un-prefixed tags to
# `localhost/<name>` and `kind load docker-image` then can't find them
# (kind's podman shim looks up the literal name, not the normalized one).
# The image-archive path preserves the in-archive name so the helm
# `--set ui.api.image.repository=localhost/...` value matches.
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
  local full="${image}:${tag}"

  log "Building ${full} (dockerfile: ${dockerfile})..."
  (cd "${REPO_ROOT}" && podman build -t "${full}" -f "${dockerfile}" .)

  log "Loading ${full} into kind cluster '${KIND_CLUSTER_NAME}' (via image-archive)..."
  local tarball
  tarball="$(mktemp -t kind-load.XXXXXX)"
  trap 'rm -f "${tarball}"' RETURN
  podman save "${full}" -o "${tarball}"
  kind load image-archive "${tarball}" --name "${KIND_CLUSTER_NAME}"
  ok "${full} loaded"
}

build_and_load "${ACKO_UI_API_IMAGE}" "Dockerfile.api"
build_and_load "${ACKO_UI_WEB_IMAGE}" "Dockerfile.ui"

ok "All 2 UI images built and loaded into kind"

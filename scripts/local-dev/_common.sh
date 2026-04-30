#!/usr/bin/env bash
# Shared helpers and environment defaults for local-dev scripts.
# Source this file from other scripts: `source "$(dirname "$0")/_common.sh"`.

set -euo pipefail

# ---------------------------------------------------------------------------
# Environment defaults
# ---------------------------------------------------------------------------
# kind cluster is named `kind` so kubectl context becomes `kind-kind`.
export KIND_CLUSTER_NAME="${KIND_CLUSTER_NAME:-kind}"
export KIND_CONTEXT="kind-${KIND_CLUSTER_NAME}"
export KIND_PROVIDER="${KIND_PROVIDER:-podman}"
export KIND_EXPERIMENTAL_PROVIDER="${KIND_PROVIDER}"

export CERT_MANAGER_NAMESPACE="${CERT_MANAGER_NAMESPACE:-cert-manager}"
export CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.15.3}"

export ACKO_NAMESPACE="${ACKO_NAMESPACE:-aerospike-operator}"
# Release name MUST equal the chart name. The chart's fullname helper returns
# the release name when it already contains the chart name, so UI resource
# names match the API_URL baked into the ui image at build time
# (`http://aerospike-ce-kubernetes-operator-ui-api:80`). A shorter release
# name produces `aerospike-operator-aerospike-ce-kubernetes-operator-*` which
# (a) breaks the baked API_URL and (b) exceeds the 63-char Service name
# limit. See Dockerfile.ui for the baked URL.
export ACKO_RELEASE="${ACKO_RELEASE:-aerospike-ce-kubernetes-operator}"
export ACKO_CRDS_RELEASE="${ACKO_CRDS_RELEASE:-aerospike-ce-kubernetes-operator-crds}"
export ACKO_CHART_VERSION="${ACKO_CHART_VERSION:-0.1.2}"
# Empty by default so the chart's natural naming wins. Set a non-empty value
# only with ACKO_UI_LOCAL_BUILD=true + a matching --build-arg API_URL.
export ACKO_FULLNAME_OVERRIDE="${ACKO_FULLNAME_OVERRIDE:-}"

# UI (chart-bundled) — opt-in. When true, run-local passes ui.enabled=true and
# the chart pulls the 2 images (api + ui) from ghcr (public). Override
# ACKO_UI_LOCAL_BUILD=true to build images from this repo's Dockerfiles and
# `kind load` them instead (useful for testing uncommitted UI changes).
export ACKO_UI_ENABLED="${ACKO_UI_ENABLED:-false}"
export ACKO_UI_LOCAL_BUILD="${ACKO_UI_LOCAL_BUILD:-false}"
export ACKO_UI_IMAGE_TAG="${ACKO_UI_IMAGE_TAG:-latest}"
# Podman normalizes bare tags to `localhost/<name>`, and `kind load
# image-archive` preserves whatever name the archive carries. Setting the
# `localhost/` prefix here keeps the build tag, the in-archive name, and the
# helm `image.repository` value (passed by acko-install.sh) in sync — without
# it, the pod tries to pull `aerospike-cluster-manager-api:latest` from
# Docker Hub and ends in ImagePullBackOff.
export ACKO_UI_API_IMAGE="${ACKO_UI_API_IMAGE:-localhost/aerospike-cluster-manager-api}"
export ACKO_UI_WEB_IMAGE="${ACKO_UI_WEB_IMAGE:-localhost/aerospike-cluster-manager-ui}"

# Resolve repo root (scripts live at <repo>/scripts/local-dev/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export KIND_CONFIG_FILE="${KIND_CONFIG_FILE:-${REPO_ROOT}/kind-config.yaml}"

# Sibling ACKO repo (required for local install).
# Layout assumption: both repos cloned under a common parent directory
#   <parent>/aerospike-cluster-manager
#   <parent>/aerospike-ce-kubernetes-operator
_sibling_charts_root="$(cd "${REPO_ROOT}/.." && pwd)/aerospike-ce-kubernetes-operator/charts"
export ACKO_CHART_PATH="${ACKO_CHART_PATH:-${_sibling_charts_root}/aerospike-ce-kubernetes-operator}"
export ACKO_CRDS_CHART_PATH="${ACKO_CRDS_CHART_PATH:-${_sibling_charts_root}/aerospike-ce-kubernetes-operator-crds}"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
log()   { printf '\033[1;34m[*]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[\xe2\x9c\x93]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; }
die()   { err "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
require_bin() {
  local bin="$1"
  local hint="${2:-}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    err "Missing required binary: $bin"
    [[ -n "$hint" ]] && err "  $hint"
    exit 1
  fi
}

require_local_dev_bins() {
  require_bin kind    "Install: https://kind.sigs.k8s.io/docs/user/quick-start/#installation"
  require_bin kubectl "Install: https://kubernetes.io/docs/tasks/tools/"
  require_bin helm    "Install: https://helm.sh/docs/intro/install/"
  require_bin "${KIND_PROVIDER}" \
    "Install: https://podman.io/docs/installation (or set KIND_PROVIDER=docker)"
}

# ---------------------------------------------------------------------------
# kind helpers
# ---------------------------------------------------------------------------
kind_cluster_exists() {
  kind get clusters 2>/dev/null | grep -qx "${KIND_CLUSTER_NAME}"
}

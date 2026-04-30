#!/usr/bin/env bash
# Install ACKO prerequisites and operator into the kind cluster.
# All dependencies are installed as explicit prereqs (no subcharts):
#   1. cert-manager      (jetstack/cert-manager)
#   2. ACKO CRDs         (aerospike-ce-kubernetes-operator-crds, sibling chart)
#   3. ACKO operator     (aerospike-ce-kubernetes-operator, sibling chart, crds.install=false)
# Idempotent.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_bin kubectl
require_bin helm

if ! kubectl config get-contexts -o name | grep -qx "${KIND_CONTEXT}"; then
  die "kubectl context '${KIND_CONTEXT}' not found — run 'make kind-up' first"
fi
kubectl config use-context "${KIND_CONTEXT}" >/dev/null

# ---------------------------------------------------------------------------
# 1. cert-manager (ACKO admission webhook prerequisite)
# ---------------------------------------------------------------------------
if helm status cert-manager -n "${CERT_MANAGER_NAMESPACE}" >/dev/null 2>&1; then
  ok "cert-manager already installed in namespace '${CERT_MANAGER_NAMESPACE}' — skipping"
else
  log "Adding jetstack helm repo..."
  helm repo add jetstack https://charts.jetstack.io >/dev/null 2>&1 || true
  helm repo update jetstack >/dev/null

  log "Installing cert-manager ${CERT_MANAGER_VERSION}..."
  helm install cert-manager jetstack/cert-manager \
    --namespace "${CERT_MANAGER_NAMESPACE}" --create-namespace \
    --version "${CERT_MANAGER_VERSION}" \
    --set crds.enabled=true \
    --wait --timeout=180s
  ok "cert-manager ${CERT_MANAGER_VERSION} installed"
fi

log "Waiting for cert-manager deployments to be Available..."
kubectl -n "${CERT_MANAGER_NAMESPACE}" wait --for=condition=Available \
  deployment/cert-manager deployment/cert-manager-webhook deployment/cert-manager-cainjector \
  --timeout=180s >/dev/null

# ---------------------------------------------------------------------------
# 2. ACKO CRDs (separate release — do NOT rely on the operator chart's subchart)
# ---------------------------------------------------------------------------
if [[ ! -f "${ACKO_CRDS_CHART_PATH}/Chart.yaml" ]]; then
  die "ACKO CRDs chart not found at: ${ACKO_CRDS_CHART_PATH}
Clone sibling repo: git clone https://github.com/aerospike-ce-ecosystem/aerospike-ce-kubernetes-operator \\
  $(cd "${REPO_ROOT}/.." && pwd)/aerospike-ce-kubernetes-operator
Or set ACKO_CRDS_CHART_PATH to an alternate location."
fi

if helm status "${ACKO_CRDS_RELEASE}" -n "${ACKO_NAMESPACE}" >/dev/null 2>&1; then
  ok "ACKO CRDs release '${ACKO_CRDS_RELEASE}' already installed in '${ACKO_NAMESPACE}' — skipping"
else
  log "Installing ACKO CRDs from ${ACKO_CRDS_CHART_PATH}"
  # --take-ownership: when CRDs from a prior release still linger on the
  # cluster (via helm.sh/resource-policy: keep) this flag lets the new release
  # reclaim them instead of failing with "exists and cannot be imported".
  helm install "${ACKO_CRDS_RELEASE}" "${ACKO_CRDS_CHART_PATH}" \
    --namespace "${ACKO_NAMESPACE}" --create-namespace \
    --take-ownership \
    --wait --timeout=120s
  ok "ACKO CRDs installed"
fi

for crd in aerospikeclusters.acko.io aerospikeclustertemplates.acko.io; do
  if kubectl get crd "${crd}" >/dev/null 2>&1; then
    ok "CRD present: ${crd}"
  else
    die "CRD missing after CRDs release install: ${crd}"
  fi
done

# ---------------------------------------------------------------------------
# 3. ACKO operator (crds.install=false — CRDs were installed above)
# ---------------------------------------------------------------------------
if [[ ! -f "${ACKO_CHART_PATH}/Chart.yaml" ]]; then
  die "ACKO operator chart not found at: ${ACKO_CHART_PATH}
Clone sibling repo or set ACKO_CHART_PATH."
fi

_helm_args=(
  --namespace "${ACKO_NAMESPACE}" --create-namespace
  --set "crds.install=false"
)
if [[ -n "${ACKO_FULLNAME_OVERRIDE}" ]]; then
  _helm_args+=(--set "fullnameOverride=${ACKO_FULLNAME_OVERRIDE}")
fi

if [[ "${ACKO_UI_ENABLED}" == "true" ]]; then
  _helm_args+=(--set "ui.enabled=true")
  if [[ "${ACKO_UI_LOCAL_BUILD}" == "true" ]]; then
    log "UI mode: ui.enabled=true with locally-built images (tag: ${ACKO_UI_IMAGE_TAG}, pullPolicy=Never)"
    _helm_args+=(
      --set "ui.api.image.repository=${ACKO_UI_API_IMAGE}"
      --set "ui.api.image.tag=${ACKO_UI_IMAGE_TAG}"
      --set "ui.api.image.pullPolicy=Never"
      --set "ui.web.image.repository=${ACKO_UI_WEB_IMAGE}"
      --set "ui.web.image.tag=${ACKO_UI_IMAGE_TAG}"
      --set "ui.web.image.pullPolicy=Never"
    )
  else
    log "UI mode: ui.enabled=true with chart-default images (ghcr.io, tag: latest)"
  fi
else
  _helm_args+=(--set "ui.enabled=false")
fi

log "helm upgrade --install ${ACKO_RELEASE} ${ACKO_CHART_PATH}"
helm upgrade --install "${ACKO_RELEASE}" "${ACKO_CHART_PATH}" \
  "${_helm_args[@]}" --wait --timeout=600s
ok "ACKO operator deployed"

log "Waiting for ACKO operator deployments to be Available..."
kubectl -n "${ACKO_NAMESPACE}" wait --for=condition=Available deployment \
  --all --timeout=180s >/dev/null
ok "ACKO operator is Ready"

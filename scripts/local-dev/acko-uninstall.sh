#!/usr/bin/env bash
# Uninstall ACKO operator + cert-manager from the kind cluster. Idempotent.
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

require_bin kubectl
require_bin helm

if ! kubectl config get-contexts -o name | grep -qx "${KIND_CONTEXT}"; then
  warn "kubectl context '${KIND_CONTEXT}' not found — nothing to uninstall"
  exit 0
fi
kubectl config use-context "${KIND_CONTEXT}" >/dev/null

if helm status "${ACKO_RELEASE}" -n "${ACKO_NAMESPACE}" >/dev/null 2>&1; then
  log "Uninstalling ACKO operator release '${ACKO_RELEASE}'..."
  helm uninstall "${ACKO_RELEASE}" -n "${ACKO_NAMESPACE}"
  ok "ACKO operator uninstalled"
else
  ok "ACKO operator release '${ACKO_RELEASE}' not present — skipping"
fi

if helm status "${ACKO_CRDS_RELEASE}" -n "${ACKO_NAMESPACE}" >/dev/null 2>&1; then
  log "Uninstalling ACKO CRDs release '${ACKO_CRDS_RELEASE}'..."
  helm uninstall "${ACKO_CRDS_RELEASE}" -n "${ACKO_NAMESPACE}"
  ok "ACKO CRDs uninstalled (CRD objects retained via helm.sh/resource-policy: keep)"
else
  ok "ACKO CRDs release '${ACKO_CRDS_RELEASE}' not present — skipping"
fi

kubectl delete namespace "${ACKO_NAMESPACE}" --ignore-not-found --timeout=60s

# Sweep orphan cluster-scoped admission webhook configs. These survive
# `helm uninstall` if they carry a release name that no longer matches
# (e.g., after changing fullnameOverride or ACKO_RELEASE between installs).
# They cause every CR create to 500 with "service ...-webhook not found".
log "Sweeping orphan admission webhook configurations for chart aerospike-ce-kubernetes-operator..."
for kind in mutatingwebhookconfiguration validatingwebhookconfiguration; do
  kubectl get "${kind}" \
    -l "app.kubernetes.io/name=aerospike-ce-kubernetes-operator" \
    -o name 2>/dev/null | while read -r res; do
    log "  deleting ${res}"
    kubectl delete "${res}" --ignore-not-found
  done
done
ok "Orphan webhook configurations swept"

if helm status cert-manager -n "${CERT_MANAGER_NAMESPACE}" >/dev/null 2>&1; then
  log "Uninstalling cert-manager..."
  helm uninstall cert-manager -n "${CERT_MANAGER_NAMESPACE}"
  kubectl delete namespace "${CERT_MANAGER_NAMESPACE}" --ignore-not-found --timeout=60s
  ok "cert-manager uninstalled"
else
  ok "cert-manager not present — skipping"
fi

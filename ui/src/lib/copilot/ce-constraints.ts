/**
 * Aerospike Community Edition constraints, exposed to the copilot as
 * queryable data (get_ce_constraints tool) so the model can self-check
 * instead of relying solely on system-prompt adherence. The authoritative
 * enforcement lives in the ACKO admission webhook — this table only improves
 * the error UX by refusing before a request is ever made.
 */

export const CE_CONSTRAINTS = {
  edition: "Aerospike Community Edition (CE)",
  maxNodes: 8,
  maxNamespaces: 2,
  unavailableFeatures: [
    "XDR (cross-datacenter replication)",
    "TLS",
    "enterprise security (auth/LDAP/vault)",
    "compression",
    "strong consistency mode",
  ],
  allowedImage: "aerospike/aerospike-server (CE) only",
  enforcedBy:
    "ACKO admission webhook (CRD validation) and aerospike-server CE itself",
} as const

import { z } from "zod";

import type { AerospikeNamespaceConfig } from "@/lib/api/types";

// K8s DNS-compatible name (RFC 1123)
export const k8sNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(63, "Name must be 63 characters or less")
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric",
  );

// Aerospike namespace name (1-63 characters, non-empty)
export const aerospikeNamespaceNameSchema = z
  .string()
  .min(1, "Namespace name is required")
  .max(63, "Namespace name must be 63 characters or less");

/** Maximum number of namespaces allowed in Aerospike CE. */
export const MAX_CE_NAMESPACES = 2;

/** Validate the namespaces array for a CE cluster (1-2 items, unique names). */
export function validateNamespaces(
  namespaces: AerospikeNamespaceConfig[],
  clusterSize: number,
): string | null {
  if (namespaces.length === 0) return "At least one namespace is required";
  if (namespaces.length > MAX_CE_NAMESPACES)
    return `Aerospike CE supports at most ${MAX_CE_NAMESPACES} namespaces`;
  const names = namespaces.map((ns) => ns.name.trim());
  if (names.some((n) => n.length === 0)) return "All namespace names are required";
  if (new Set(names).size !== names.length) return "Namespace names must be unique";
  for (const ns of namespaces) {
    if (ns.replicationFactor > clusterSize)
      return `Namespace "${ns.name}" replication factor (${ns.replicationFactor}) exceeds cluster size (${clusterSize})`;
  }
  return null;
}

// K8s CPU resource (e.g., "500m", "1", "2.5")
export const k8sCpuSchema = z
  .string()
  .min(1, "CPU is required")
  .regex(/^[0-9]+(\.[0-9]+)?m?$/, "Invalid CPU format (e.g., '500m', '1', '2.5')");

// K8s memory resource (e.g., "1Gi", "512Mi", "256Mi")
export const k8sMemorySchema = z
  .string()
  .min(1, "Memory is required")
  .regex(/^[0-9]+(\.[0-9]+)?[KMGTPE]i$/, "Invalid memory format (e.g., '512Mi', '1Gi', '4Gi')");

// K8s storage size (e.g., "10Gi", "100Gi")
export const k8sStorageSizeSchema = z
  .string()
  .min(1, "Size is required")
  .regex(/^[0-9]+[KMGTPE]i$/, "Invalid storage size (e.g., '10Gi', '100Gi')");

// K8s Rolling Update config
export const rollingUpdateConfigSchema = z.object({
  batchSize: z.number().int().min(1, "Batch size must be at least 1").optional(),
  maxUnavailable: z
    .union([
      z.number().int().min(0, "Must be a non-negative integer"),
      z.string().regex(/^\d+%$/, "Must be a number or percentage like '30%'"),
    ])
    .optional(),
  disablePDB: z.boolean().optional(),
});

// Validation helpers
export function validateK8sName(value: string): string | null {
  const result = k8sNameSchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

export function validateK8sCpu(value: string): string | null {
  const result = k8sCpuSchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

export function validateK8sMemory(value: string): string | null {
  const result = k8sMemorySchema.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
}

/** Parse K8s CPU string to millicores for comparison. */
export function parseCpuMillis(cpu: string): number {
  if (cpu.endsWith("m")) return parseFloat(cpu.slice(0, -1));
  return parseFloat(cpu) * 1000;
}

const MEMORY_UNITS: Record<string, number> = {
  Ki: 1,
  Mi: 2,
  Gi: 3,
  Ti: 4,
  Pi: 5,
  Ei: 6,
};

/** Parse K8s memory string to bytes for comparison. */
export function parseMemoryBytes(mem: string): number {
  const m = mem.match(/^([0-9]+(?:\.[0-9]+)?)([KMGTPE]i)$/);
  if (!m) return 0;
  const unit = m[2];
  return parseFloat(m[1]) * Math.pow(1024, MEMORY_UNITS[unit] ?? 0);
}

/** Aerospike overhead factor (30% for primary index, buffers, internal structures). */
const AEROSPIKE_MEMORY_OVERHEAD = 1.3;

/**
 * Calculate minimum pod memory (bytes) required for the given namespaces.
 * Only in-memory namespaces contribute; device namespaces use disk.
 */
export function calculateMinMemoryBytes(namespaces: AerospikeNamespaceConfig[]): number {
  const totalDataBytes = namespaces.reduce((sum, ns) => {
    if (ns.storageEngine.type === "memory") {
      return sum + (ns.storageEngine.dataSize ?? 1073741824);
    }
    return sum;
  }, 0);
  if (totalDataBytes === 0) return 0;
  return Math.ceil(totalDataBytes * AEROSPIKE_MEMORY_OVERHEAD);
}

/** Format bytes to a human-readable K8s memory string (e.g., "2Gi"). */
export function formatMemoryGi(bytes: number): string {
  const gi = Math.ceil(bytes / 1024 ** 3);
  return `${Math.max(1, gi)}Gi`;
}

/**
 * Validate that memory limit is sufficient for namespace data sizes.
 * Returns a warning message or null if ok.
 */
export function validateMemoryForNamespaces(
  memoryLimit: string,
  namespaces: AerospikeNamespaceConfig[],
): string | null {
  const minBytes = calculateMinMemoryBytes(namespaces);
  if (minBytes === 0) return null;
  const limitBytes = parseMemoryBytes(memoryLimit);
  if (limitBytes === 0) return null;
  if (limitBytes < minBytes) {
    return `Memory limit (${memoryLimit}) is insufficient for namespace data sizes. Minimum recommended: ${formatMemoryGi(minBytes)}`;
  }
  return null;
}

/** Validate that the image is not an enterprise image (CE operator only supports CE images). */
export function validateImageNotEnterprise(image: string): string | null {
  if (/enterprise/i.test(image)) {
    return "Enterprise images are not supported in CE mode. Please use a CE image (e.g., aerospike:ce-8.1.1.1).";
  }
  const tag = image.split(":")[1] ?? "";
  if (/^(ee|ent)-/i.test(tag)) {
    return "Enterprise images are not supported in CE mode. Please use a CE image (e.g., aerospike:ce-8.1.1.1).";
  }
  return null;
}

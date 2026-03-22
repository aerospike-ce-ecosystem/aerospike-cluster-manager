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


// ── Enterprise image rejection ──

const ENTERPRISE_IMAGE_RE = /enterprise|ee-|ent-/i;

/**
 * Validate that the image is not an Enterprise edition image.
 * CE operator rejects enterprise images; catch early in the UI.
 */
export function validateImageNotEnterprise(image: string): string | null {
  if (ENTERPRISE_IMAGE_RE.test(image)) {
    return "Enterprise images are not supported. Use Aerospike Community Edition (CE) images.";
  }
  return null;
}

// ── CE image validation ──

/** Minimum required Aerospike CE major version. */
export const MIN_CE_MAJOR_VERSION = 8;

const CE_IMAGE_RE = /^(?:.*\/)?aerospike:ce-(\d+)\.\d+\.\d+\.\d+$/;

/**
 * Parse the major version from an Aerospike CE image tag.
 * Returns null if the image doesn't match the expected pattern.
 */
export function parseCEMajorVersion(image: string): number | null {
  const m = CE_IMAGE_RE.exec(image);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Validate that the image is a supported CE version (>= 8).
 * Returns an error string or null if valid.
 */
export function validateCEImage(image: string): string | null {
  if (!image.trim()) return "Image is required";
  const major = parseCEMajorVersion(image);
  if (major === null) return null; // allow non-standard images without blocking
  if (major < MIN_CE_MAJOR_VERSION) {
    return `Aerospike CE ${major}.x is not supported. Minimum required version is CE ${MIN_CE_MAJOR_VERSION}.x`;
  }
  return null;
}

// ── aerospikeConfig validation ──

/** Keys forbidden in Aerospike CE configuration (Enterprise-only features). */
const FORBIDDEN_CE_CONFIG_KEYS = ["xdr", "tls"] as const;

/**
 * Validate that aerospikeConfig does not contain Enterprise-only sections.
 * Returns an error string or null if valid.
 */
export function validateAerospikeConfig(config: Record<string, unknown>): string | null {
  for (const key of FORBIDDEN_CE_CONFIG_KEYS) {
    if (key in config) {
      return `"${key}" section is not available in Aerospike CE. This is an Enterprise-only feature.`;
    }
  }
  return null;
}

// ── Rack operation validation ──

/**
 * Validate that a rack config update doesn't simultaneously add and remove racks.
 * The operator webhook rejects this; we catch it early in the UI.
 */
export function validateRackUpdate(currentRackIds: number[], newRackIds: number[]): string | null {
  const currentSet = new Set(currentRackIds);
  const newSet = new Set(newRackIds);
  const added = newRackIds.filter((id) => !currentSet.has(id));
  const removed = currentRackIds.filter((id) => !newSet.has(id));
  if (added.length > 0 && removed.length > 0) {
    return `Cannot add rack(s) [${added.join(", ")}] and remove rack(s) [${removed.join(", ")}] in the same update. Apply these changes separately.`;
  }
  return null;
}

import type {
  CreateK8sClusterRequest,
  ResourceConfig,
  MonitoringConfig,
  NetworkAccessConfig,
  StorageVolumeConfig,
} from "@/lib/api/types";

/**
 * Build form updates from a template's spec.
 * Only maps fields that the template actually provides (non-null/non-undefined).
 */
export function buildFormUpdatesFromTemplate(
  spec: Record<string, unknown>,
  templateName: string,
): Partial<CreateK8sClusterRequest> {
  const updates: Partial<CreateK8sClusterRequest> = {
    templateRef: {
      name: templateName,
    },
    templateOverrides: undefined,
  };

  if (typeof spec.image === "string" && spec.image) {
    updates.image = spec.image;
  }

  if (typeof spec.size === "number" && spec.size >= 1 && spec.size <= 8) {
    updates.size = spec.size;
  }

  if (spec.resources && typeof spec.resources === "object") {
    const res = spec.resources as ResourceConfig;
    if (res.requests && res.limits) {
      updates.resources = res;
    }
  }

  if (spec.monitoring && typeof spec.monitoring === "object") {
    const mon = spec.monitoring as MonitoringConfig;
    if (typeof mon.enabled === "boolean") {
      updates.monitoring = mon;
    }
  }

  if (spec.networkPolicy && typeof spec.networkPolicy === "object") {
    updates.networkPolicy = spec.networkPolicy as NetworkAccessConfig;
  }

  if (spec.storage && typeof spec.storage === "object") {
    const st = spec.storage as Record<string, unknown>;
    const res = st.resources as Record<string, unknown> | undefined;
    const req = res?.requests as Record<string, unknown> | undefined;
    const storageUpdate: StorageVolumeConfig = {
      storageClass: (st.storageClassName as string) || "standard",
      size: (req?.storage as string) || (st.size as string) || "10Gi",
      mountPath: "/opt/aerospike/data",
    };
    updates.storage = storageUpdate;
  }

  return updates;
}

/** Format a template spec field for display in the preview panel. */
export function formatTemplateSpecField(key: string, value: unknown): string | null {
  if (value == null) return null;

  switch (key) {
    case "image":
      return typeof value === "string" ? value : null;
    case "size":
      return typeof value === "number" ? `${value} node${value !== 1 ? "s" : ""}` : null;
    case "resources": {
      const res = value as ResourceConfig;
      if (!res.requests || !res.limits) return null;
      return `CPU: ${res.requests.cpu}/${res.limits.cpu}, Mem: ${res.requests.memory}/${res.limits.memory}`;
    }
    case "monitoring": {
      const mon = value as MonitoringConfig;
      return mon.enabled ? `Enabled (port ${mon.port})` : "Disabled";
    }
    case "storage": {
      const st = value as Record<string, unknown>;
      const parts: string[] = [];
      const res = st.resources as Record<string, unknown> | undefined;
      const req = res?.requests as Record<string, unknown> | undefined;
      if (req?.storage) parts.push(req.storage as string);
      if (st.storageClassName) parts.push(st.storageClassName as string);
      return parts.length > 0 ? parts.join(" / ") : null;
    }
    case "networkPolicy": {
      const np = value as NetworkAccessConfig;
      return np.accessType || null;
    }
    case "scheduling": {
      const sched = value as Record<string, unknown>;
      const parts: string[] = [];
      if (sched.podAntiAffinityLevel) parts.push(`anti-affinity: ${sched.podAntiAffinityLevel}`);
      if (sched.podManagementPolicy) parts.push(`policy: ${sched.podManagementPolicy}`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    default:
      return null;
  }
}

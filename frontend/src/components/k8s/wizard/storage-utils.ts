import type {
  StorageVolumeConfig,
  StorageSpec,
  VolumeSpec,
  VolumeSourceType,
} from "@/lib/api/types";

/** Type guard to check if storage is StorageSpec (multi-volume). */
export function isStorageSpec(s: StorageVolumeConfig | StorageSpec | undefined): s is StorageSpec {
  return !!s && "volumes" in s;
}

/** Create a default PVC volume. */
export function makeDefaultPvcVolume(
  name: string,
  storageClass: string,
  size: string,
  mountPath: string,
): VolumeSpec {
  return {
    name,
    source: "persistentVolume",
    persistentVolume: {
      storageClass,
      size,
      volumeMode: "Filesystem",
      accessModes: ["ReadWriteOnce"],
    },
    aerospike: { path: mountPath },
    cascadeDelete: true,
  };
}

/** Create a default emptyDir volume. */
export function makeDefaultEmptyDirVolume(name: string, mountPath: string): VolumeSpec {
  return {
    name,
    source: "emptyDir",
    emptyDir: {},
    aerospike: { path: mountPath },
  };
}

export const SOURCE_TYPE_LABELS: Record<VolumeSourceType, string> = {
  persistentVolume: "Persistent Volume (PVC)",
  emptyDir: "Empty Dir",
  secret: "Secret",
  configMap: "ConfigMap",
  hostPath: "Host Path",
};

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { validateNamespaces, MAX_CE_NAMESPACES } from "@/lib/validations/k8s";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import type {
  AerospikeNamespaceConfig,
  StorageVolumeConfig,
  StorageSpec,
  VolumeSpec,
  VolumeSourceType,
  VolumeInitMethod,
  VolumeWipeMethod,
} from "@/lib/api/types";
import type { WizardNamespaceStorageStepProps } from "./types";

/** Type guard to check if storage is StorageSpec (multi-volume). */
function isStorageSpec(s: StorageVolumeConfig | StorageSpec | undefined): s is StorageSpec {
  return !!s && "volumes" in s;
}

/** Create a default PVC volume. */
function makeDefaultPvcVolume(
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
function makeDefaultEmptyDirVolume(name: string, mountPath: string): VolumeSpec {
  return {
    name,
    source: "emptyDir",
    emptyDir: {},
    aerospike: { path: mountPath },
  };
}

const SOURCE_TYPE_LABELS: Record<VolumeSourceType, string> = {
  persistentVolume: "Persistent Volume (PVC)",
  emptyDir: "Empty Dir",
  secret: "Secret",
  configMap: "ConfigMap",
  hostPath: "Host Path",
};

function VolumeEditor({
  vol,
  index,
  storageClasses,
  onChange,
  onRemove,
}: {
  vol: VolumeSpec;
  index: number;
  storageClasses: string[];
  onChange: (updated: VolumeSpec) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Volume: {vol.name || `(unnamed ${index + 1})`}
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            [{SOURCE_TYPE_LABELS[vol.source]}]
          </span>
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 pl-1">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`vol-name-${index}`}>Volume Name</Label>
              <Input
                id={`vol-name-${index}`}
                value={vol.name}
                onChange={(e) => onChange({ ...vol, name: e.target.value })}
                placeholder="e.g. data-vol"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`vol-source-${index}`}>Source Type</Label>
              <Select
                value={vol.source}
                onValueChange={(v) => {
                  const src = v as VolumeSourceType;
                  const updated: VolumeSpec = { ...vol, source: src };
                  // Reset source-specific fields
                  if (src === "persistentVolume") {
                    updated.persistentVolume = {
                      storageClass: storageClasses[0] || "standard",
                      size: "10Gi",
                      volumeMode: "Filesystem",
                      accessModes: ["ReadWriteOnce"],
                    };
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "emptyDir") {
                    updated.emptyDir = {};
                    updated.persistentVolume = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "secret") {
                    updated.secret = { secretName: "" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "configMap") {
                    updated.configMap = { name: "" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "hostPath") {
                    updated.hostPath = { path: "", type: "DirectoryOrCreate" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                  }
                  onChange(updated);
                }}
              >
                <SelectTrigger id={`vol-source-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PVC-specific fields */}
          {vol.source === "persistentVolume" && vol.persistentVolume && (
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Storage Class</Label>
                <Select
                  value={vol.persistentVolume.storageClass || "standard"}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: { ...vol.persistentVolume!, storageClass: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageClasses.length > 0 ? (
                      storageClasses.map((sc) => (
                        <SelectItem key={sc} value={sc}>
                          {sc}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="standard">standard</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Size</Label>
                <Select
                  value={vol.persistentVolume.size}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: { ...vol.persistentVolume!, size: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1Gi">1 GiB</SelectItem>
                    <SelectItem value="5Gi">5 GiB</SelectItem>
                    <SelectItem value="10Gi">10 GiB</SelectItem>
                    <SelectItem value="20Gi">20 GiB</SelectItem>
                    <SelectItem value="50Gi">50 GiB</SelectItem>
                    <SelectItem value="100Gi">100 GiB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Volume Mode</Label>
                <Select
                  value={vol.persistentVolume.volumeMode || "Filesystem"}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: {
                        ...vol.persistentVolume!,
                        volumeMode: v as "Filesystem" | "Block",
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Filesystem">Filesystem</SelectItem>
                    <SelectItem value="Block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Secret source */}
          {vol.source === "secret" && (
            <div className="grid gap-2">
              <Label>Secret Name</Label>
              <Input
                value={(vol.secret as Record<string, string>)?.secretName || ""}
                onChange={(e) =>
                  onChange({ ...vol, secret: { ...vol.secret, secretName: e.target.value } })
                }
                placeholder="my-secret"
              />
            </div>
          )}

          {/* ConfigMap source */}
          {vol.source === "configMap" && (
            <div className="grid gap-2">
              <Label>ConfigMap Name</Label>
              <Input
                value={(vol.configMap as Record<string, string>)?.name || ""}
                onChange={(e) =>
                  onChange({ ...vol, configMap: { ...vol.configMap, name: e.target.value } })
                }
                placeholder="my-config"
              />
            </div>
          )}

          {/* HostPath source */}
          {vol.source === "hostPath" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Host Path</Label>
                <Input
                  value={(vol.hostPath as Record<string, string>)?.path || ""}
                  onChange={(e) =>
                    onChange({ ...vol, hostPath: { ...vol.hostPath, path: e.target.value } })
                  }
                  placeholder="/data/aerospike"
                />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={(vol.hostPath as Record<string, string>)?.type || "DirectoryOrCreate"}
                  onValueChange={(v) =>
                    onChange({ ...vol, hostPath: { ...vol.hostPath, type: v } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DirectoryOrCreate">DirectoryOrCreate</SelectItem>
                    <SelectItem value="Directory">Directory</SelectItem>
                    <SelectItem value="FileOrCreate">FileOrCreate</SelectItem>
                    <SelectItem value="File">File</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Mount path (Aerospike container) */}
          <div className="grid gap-2">
            <Label>Mount Path (Aerospike Container)</Label>
            <Input
              value={vol.aerospike?.path || ""}
              onChange={(e) =>
                onChange({
                  ...vol,
                  aerospike: { ...vol.aerospike, path: e.target.value },
                })
              }
              placeholder="/opt/aerospike/data"
            />
          </div>

          {/* Init / Wipe / Cascade */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Init Method</Label>
              <Select
                value={vol.initMethod || "none"}
                onValueChange={(v) =>
                  onChange({
                    ...vol,
                    initMethod: v === "none" ? undefined : (v as VolumeInitMethod),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="deleteFiles">Delete Files</SelectItem>
                  <SelectItem value="dd">DD (zero-fill)</SelectItem>
                  <SelectItem value="blkdiscard">Block Discard</SelectItem>
                  <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Wipe Method</Label>
              <Select
                value={vol.wipeMethod || "none"}
                onValueChange={(v) =>
                  onChange({
                    ...vol,
                    wipeMethod: v === "none" ? undefined : (v as VolumeWipeMethod),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="deleteFiles">Delete Files</SelectItem>
                  <SelectItem value="dd">DD (zero-fill)</SelectItem>
                  <SelectItem value="blkdiscard">Block Discard</SelectItem>
                  <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                  <SelectItem value="blkdiscardWithHeaderCleanup">
                    Block Discard + Header
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id={`cascade-delete-${index}`}
                checked={vol.cascadeDelete ?? false}
                onCheckedChange={(checked) => onChange({ ...vol, cascadeDelete: checked === true })}
              />
              <Label htmlFor={`cascade-delete-${index}`} className="text-sm font-normal">
                Cascade Delete
              </Label>
            </div>
          </div>

          {/* Read-only mount */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`read-only-${index}`}
              checked={vol.aerospike?.readOnly ?? false}
              onCheckedChange={(checked) =>
                onChange({
                  ...vol,
                  aerospike: {
                    ...vol.aerospike,
                    path: vol.aerospike?.path || "",
                    readOnly: checked === true,
                  },
                })
              }
            />
            <Label htmlFor={`read-only-${index}`} className="text-sm font-normal">
              Mount read-only
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

export function WizardNamespaceStorageStep({
  form,
  updateForm,
  storageClasses,
  defaultStorage,
  defaultStorageSpec,
}: WizardNamespaceStorageStepProps) {
  const [useMultiVolume, setUseMultiVolume] = useState(() => isStorageSpec(form.storage));

  const updateNamespace = (index: number, updates: Partial<AerospikeNamespaceConfig>) => {
    const namespaces = [...form.namespaces];
    namespaces[index] = { ...namespaces[index], ...updates };
    updateForm({ namespaces });
  };

  const addNamespace = () => {
    if (form.namespaces.length >= MAX_CE_NAMESPACES) return;
    const newNs: AerospikeNamespaceConfig = {
      name: "",
      replicationFactor: Math.min(2, form.size),
      storageEngine: { type: "memory", dataSize: 1073741824 },
    };
    updateForm({ namespaces: [...form.namespaces, newNs] });
  };

  const removeNamespace = (index: number) => {
    if (form.namespaces.length <= 1) return;
    updateForm({ namespaces: form.namespaces.filter((_, i) => i !== index) });
  };

  const isStoragePersistent = form.namespaces.some((ns) => ns.storageEngine.type === "device");

  // Multi-volume helpers
  const storageSpec: StorageSpec = isStorageSpec(form.storage) ? form.storage : defaultStorageSpec;

  const updateStorageSpec = (updated: StorageSpec) => {
    updateForm({ storage: updated });
  };

  const updateVolume = (index: number, updated: VolumeSpec) => {
    const volumes = [...storageSpec.volumes];
    volumes[index] = updated;
    updateStorageSpec({ ...storageSpec, volumes });
  };

  const addVolume = (type: VolumeSourceType) => {
    const existing = storageSpec.volumes;
    let vol: VolumeSpec;
    if (type === "persistentVolume") {
      vol = makeDefaultPvcVolume(
        `vol-${existing.length + 1}`,
        storageClasses[0] || "standard",
        "10Gi",
        "/opt/aerospike/data",
      );
    } else if (type === "emptyDir") {
      vol = makeDefaultEmptyDirVolume(`vol-${existing.length + 1}`, "/opt/aerospike/work");
    } else if (type === "secret") {
      vol = {
        name: `vol-${existing.length + 1}`,
        source: "secret",
        secret: { secretName: "" },
        aerospike: { path: "/etc/aerospike/secrets" },
      };
    } else if (type === "configMap") {
      vol = {
        name: `vol-${existing.length + 1}`,
        source: "configMap",
        configMap: { name: "" },
        aerospike: { path: "/etc/aerospike/config" },
      };
    } else {
      vol = {
        name: `vol-${existing.length + 1}`,
        source: "hostPath",
        hostPath: { path: "", type: "DirectoryOrCreate" },
        aerospike: { path: "/data" },
      };
    }
    updateStorageSpec({ ...storageSpec, volumes: [...existing, vol] });
  };

  const removeVolume = (index: number) => {
    updateStorageSpec({
      ...storageSpec,
      volumes: storageSpec.volumes.filter((_, i) => i !== index),
    });
  };

  // Toggle between simple and multi-volume mode
  const handleModeToggle = (multi: boolean) => {
    setUseMultiVolume(multi);
    if (multi && !isStorageSpec(form.storage)) {
      // Convert legacy storage to multi-volume
      const legacy = form.storage as StorageVolumeConfig | undefined;
      const volumes: VolumeSpec[] = [];
      if (legacy) {
        volumes.push(
          makeDefaultPvcVolume("data-vol", legacy.storageClass, legacy.size, legacy.mountPath),
        );
        if (legacy.initMethod) volumes[0].initMethod = legacy.initMethod;
        if (legacy.wipeMethod) volumes[0].wipeMethod = legacy.wipeMethod;
        if (legacy.cascadeDelete !== undefined) volumes[0].cascadeDelete = legacy.cascadeDelete;
      }
      volumes.push(makeDefaultEmptyDirVolume("workdir", "/opt/aerospike/work"));
      updateForm({
        storage: { volumes },
      });
    } else if (!multi && isStorageSpec(form.storage)) {
      // Convert back to legacy single volume
      const pvcVol = form.storage.volumes.find((v) => v.source === "persistentVolume");
      if (pvcVol?.persistentVolume) {
        updateForm({
          storage: {
            storageClass: pvcVol.persistentVolume.storageClass || "standard",
            size: pvcVol.persistentVolume.size,
            mountPath: pvcVol.aerospike?.path || "/opt/aerospike/data",
            initMethod: pvcVol.initMethod,
            wipeMethod: pvcVol.wipeMethod,
            cascadeDelete: pvcVol.cascadeDelete,
          },
        });
      } else {
        updateForm({ storage: undefined });
      }
    }
  };

  return (
    <>
      <p className="text-base-content/60 text-xs">
        Aerospike CE supports up to {MAX_CE_NAMESPACES} namespaces per cluster.
      </p>

      {form.namespaces.map((ns, ni) => {
        const nsIsDevice = ns.storageEngine.type === "device";
        return (
          <div key={`ns-${ni}`} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Namespace {ni + 1}</span>
              {form.namespaces.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => removeNamespace(ni)}>
                  Remove
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`ns-name-${ni}`}>Namespace Name</Label>
              <Input
                id={`ns-name-${ni}`}
                value={ns.name}
                onChange={(e) => updateNamespace(ni, { name: e.target.value })}
              />
              {ns.name !== undefined && ns.name.trim().length === 0 && (
                <p className="text-error text-xs">Namespace name is required</p>
              )}
              {form.namespaces.length > 1 &&
                ns.name.trim().length > 0 &&
                form.namespaces.filter((o) => o.name.trim() === ns.name.trim()).length > 1 && (
                  <p className="text-error text-xs">Namespace names must be unique</p>
                )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`storage-type-${ni}`}>Storage Type</Label>
              <div
                id={`storage-type-${ni}`}
                className="flex gap-2"
                role="group"
                aria-label={`Storage type for namespace ${ni + 1}`}
              >
                <Button
                  type="button"
                  variant={!nsIsDevice ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    updateNamespace(ni, {
                      storageEngine: { type: "memory", dataSize: 1073741824 },
                    })
                  }
                >
                  In-Memory
                </Button>
                <Button
                  type="button"
                  variant={nsIsDevice ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    updateNamespace(ni, {
                      storageEngine: { type: "device", filesize: 4294967296 },
                    });
                    if (!form.storage) {
                      if (useMultiVolume) {
                        updateForm({
                          storage: {
                            volumes: [
                              makeDefaultPvcVolume(
                                "data-vol",
                                storageClasses[0] || "standard",
                                "10Gi",
                                "/opt/aerospike/data",
                              ),
                              makeDefaultEmptyDirVolume("workdir", "/opt/aerospike/work"),
                            ],
                          },
                        });
                      } else {
                        updateForm({
                          storage: {
                            storageClass: storageClasses[0] || "standard",
                            size: "10Gi",
                            mountPath: "/opt/aerospike/data",
                          },
                        });
                      }
                    }
                  }}
                >
                  Persistent (Device)
                </Button>
              </div>
            </div>

            {!nsIsDevice && (
              <div className="grid gap-2">
                <Label htmlFor={`memory-size-${ni}`}>Memory Size</Label>
                <Select
                  value={String(ns.storageEngine.dataSize || 1073741824)}
                  onChange={(e) =>
                    updateNamespace(ni, {
                      storageEngine: { type: "memory", dataSize: parseInt(e.target.value) },
                    })
                  }
                  id={`memory-size-${ni}`}
                >
                  <option value="1073741824">1 GiB</option>
                  <option value="2147483648">2 GiB</option>
                  <option value="4294967296">4 GiB</option>
                  <option value="8589934592">8 GiB</option>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`repl-factor-${ni}`}>Replication Factor (1 - {form.size})</Label>
              <Input
                id={`repl-factor-${ni}`}
                type="number"
                min={1}
                max={form.size}
                value={ns.replicationFactor}
                onChange={(e) =>
                  updateNamespace(ni, {
                    replicationFactor: Math.min(
                      form.size,
                      Math.max(1, parseInt(e.target.value) || 1),
                    ),
                  })
                }
              />
              {ns.replicationFactor > form.size && (
                <p className="text-error text-xs">
                  Replication factor ({ns.replicationFactor}) cannot exceed cluster size (
                  {form.size}).
                </p>
              )}
            </div>
          </div>
        );
      })}

      {form.namespaces.length < MAX_CE_NAMESPACES && (
        <Button type="button" variant="outline" size="sm" onClick={addNamespace}>
          Add Namespace
        </Button>
      )}

      {validateNamespaces(form.namespaces, form.size) && (
        <p className="text-error text-xs">{validateNamespaces(form.namespaces, form.size)}</p>
      )}

      {/* Storage mode toggle */}
      {isStoragePersistent && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Storage Mode</span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={!useMultiVolume ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeToggle(false)}
              >
                Simple
              </Button>
              <Button
                type="button"
                variant={useMultiVolume ? "default" : "outline"}
                size="sm"
                onClick={() => handleModeToggle(true)}
              >
                Multi-Volume
              </Button>
            </div>
          </div>

          {/* Simple (legacy) mode */}
          {!useMultiVolume && !isStorageSpec(form.storage) && (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <span className="text-sm font-medium">Persistent Volume Settings</span>

              <div className="grid gap-2">
                <Label htmlFor="storage-class">Storage Class</Label>
                <Select
                  value={
                    (form.storage as StorageVolumeConfig | undefined)?.storageClass || "standard"
                  }
                  onValueChange={(v) => {
                    const base =
                      (form.storage as StorageVolumeConfig | undefined) ?? defaultStorage;
                    updateForm({ storage: { ...base, storageClass: v } });
                  }}
                >
                  <SelectTrigger id="storage-class">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageClasses.length > 0 ? (
                      storageClasses.map((sc) => (
                        <SelectItem key={sc} value={sc}>
                          {sc}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="standard">standard</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pv-size">Volume Size</Label>
                <Select
                  value={(form.storage as StorageVolumeConfig | undefined)?.size || "10Gi"}
                  onValueChange={(v) => {
                    const base =
                      (form.storage as StorageVolumeConfig | undefined) ?? defaultStorage;
                    updateForm({ storage: { ...base, size: v } });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5Gi">5 GiB</SelectItem>
                    <SelectItem value="10Gi">10 GiB</SelectItem>
                    <SelectItem value="20Gi">20 GiB</SelectItem>
                    <SelectItem value="50Gi">50 GiB</SelectItem>
                    <SelectItem value="100Gi">100 GiB</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="init-method">Init Method</Label>
                  <Select
                    value={(form.storage as StorageVolumeConfig | undefined)?.initMethod || "none"}
                    onValueChange={(v) => {
                      const base = (form.storage as StorageVolumeConfig | undefined) ?? {
                        storageClass: "standard",
                        size: "10Gi",
                        mountPath: "/opt/aerospike/data",
                      };
                      updateForm({
                        storage: {
                          ...base,
                          initMethod:
                            v === "none" ? undefined : (v as StorageVolumeConfig["initMethod"]),
                        },
                      });
                    }}
                  >
                    <SelectTrigger id="init-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="deleteFiles">Delete Files</SelectItem>
                      <SelectItem value="dd">DD (zero-fill)</SelectItem>
                      <SelectItem value="blkdiscard">Block Discard</SelectItem>
                      <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="wipe-method">Wipe Method</Label>
                  <Select
                    value={(form.storage as StorageVolumeConfig | undefined)?.wipeMethod || "none"}
                    onValueChange={(v) => {
                      const base = (form.storage as StorageVolumeConfig | undefined) ?? {
                        storageClass: "standard",
                        size: "10Gi",
                        mountPath: "/opt/aerospike/data",
                      };
                      updateForm({
                        storage: {
                          ...base,
                          wipeMethod:
                            v === "none" ? undefined : (v as StorageVolumeConfig["wipeMethod"]),
                        },
                      });
                    }}
                  >
                    <SelectTrigger id="wipe-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="deleteFiles">Delete Files</SelectItem>
                      <SelectItem value="dd">DD (zero-fill)</SelectItem>
                      <SelectItem value="blkdiscard">Block Discard</SelectItem>
                      <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                      <SelectItem value="blkdiscardWithHeaderCleanup">
                        Block Discard + Header
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Init: how volumes are prepared on first use. Wipe: how dirty volumes are cleaned on
                pod restart.
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="cascade-delete"
                  checked={(form.storage as StorageVolumeConfig | undefined)?.cascadeDelete ?? true}
                  onCheckedChange={(checked) => {
                    const base =
                      (form.storage as StorageVolumeConfig | undefined) ?? defaultStorage;
                    updateForm({ storage: { ...base, cascadeDelete: checked === true } });
                  }}
                />
                <Label htmlFor="cascade-delete" className="text-sm font-normal">
                  Delete PVCs when cluster is deleted (cascade delete)
                </Label>
              </div>
            </div>
          )}

          {/* Multi-volume mode */}
          {useMultiVolume && (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Volumes ({storageSpec.volumes.length})</span>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVolume("persistentVolume")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> PVC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVolume("emptyDir")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> EmptyDir
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVolume("secret")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Secret
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVolume("configMap")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> ConfigMap
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addVolume("hostPath")}
                  >
                    <Plus className="mr-1 h-3 w-3" /> HostPath
                  </Button>
                </div>
              </div>

              {storageSpec.volumes.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-xs">
                  No volumes configured. Add a volume above.
                </p>
              )}

              {storageSpec.volumes.map((vol, vi) => (
                <VolumeEditor
                  key={`vol-${vi}`}
                  vol={vol}
                  index={vi}
                  storageClasses={storageClasses}
                  onChange={(updated) => updateVolume(vi, updated)}
                  onRemove={() => removeVolume(vi)}
                />
              ))}

              {/* Global storage settings */}
              {storageSpec.volumes.length > 0 && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <span className="text-muted-foreground text-xs font-medium">
                    Global Storage Policies
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Cleanup Threads</Label>
                      <Input
                        type="number"
                        min={1}
                        value={storageSpec.cleanupThreads ?? 1}
                        onChange={(e) =>
                          updateStorageSpec({
                            ...storageSpec,
                            cleanupThreads: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="delete-local-on-restart"
                      checked={storageSpec.deleteLocalStorageOnRestart ?? false}
                      onCheckedChange={(checked) =>
                        updateStorageSpec({
                          ...storageSpec,
                          deleteLocalStorageOnRestart: checked === true,
                        })
                      }
                    />
                    <Label htmlFor="delete-local-on-restart" className="text-sm font-normal">
                      Delete local storage PVCs on pod restart
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

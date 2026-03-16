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
import { Plus } from "lucide-react";
import type {
  AerospikeNamespaceConfig,
  StorageVolumeConfig,
  StorageSpec,
  VolumeSpec,
  VolumeSourceType,
} from "@/lib/api/types";
import type { WizardNamespaceStorageStepProps } from "./types";
import { isStorageSpec, makeDefaultPvcVolume, makeDefaultEmptyDirVolume } from "./storage-utils";
import { VolumeEditor } from "./volume-editor";
import { NamespaceEditor } from "./namespace-editor";

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

  const handleDeviceStorageNeeded = () => {
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
      <NamespaceEditor
        namespaces={form.namespaces}
        clusterSize={form.size}
        onUpdateNamespace={updateNamespace}
        onAddNamespace={addNamespace}
        onRemoveNamespace={removeNamespace}
        onDeviceStorageNeeded={handleDeviceStorageNeeded}
      />

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

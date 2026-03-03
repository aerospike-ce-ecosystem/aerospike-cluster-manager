import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  validateNamespaces,
  MAX_CE_NAMESPACES,
} from "@/lib/validations/k8s";
import type { AerospikeNamespaceConfig, StorageVolumeConfig } from "@/lib/api/types";
import type { WizardNamespaceStorageStepProps } from "./types";

export function WizardNamespaceStorageStep({
  form,
  updateForm,
  storageClasses,
  defaultStorage,
}: WizardNamespaceStorageStepProps) {
  const updateNamespace = (
    index: number,
    updates: Partial<AerospikeNamespaceConfig>,
  ) => {
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

  return (
    <>
      <p className="text-muted-foreground text-xs">
        Aerospike CE supports up to {MAX_CE_NAMESPACES} namespaces per cluster.
      </p>

      {form.namespaces.map((ns, ni) => {
        const nsIsDevice = ns.storageEngine.type === "device";
        return (
          <div key={`ns-${ni}`} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Namespace {ni + 1}</span>
              {form.namespaces.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNamespace(ni)}
                >
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
                <p className="text-destructive text-xs">Namespace name is required</p>
              )}
              {form.namespaces.length > 1 &&
                ns.name.trim().length > 0 &&
                form.namespaces.filter((o) => o.name.trim() === ns.name.trim()).length >
                  1 && (
                  <p className="text-destructive text-xs">Namespace names must be unique</p>
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
                      updateForm({
                        storage: {
                          storageClass: storageClasses[0] || "standard",
                          size: "10Gi",
                          mountPath: "/opt/aerospike/data",
                        },
                      });
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
                  onValueChange={(v) =>
                    updateNamespace(ni, {
                      storageEngine: { type: "memory", dataSize: parseInt(v) },
                    })
                  }
                >
                  <SelectTrigger id={`memory-size-${ni}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1073741824">1 GiB</SelectItem>
                    <SelectItem value="2147483648">2 GiB</SelectItem>
                    <SelectItem value="4294967296">4 GiB</SelectItem>
                    <SelectItem value="8589934592">8 GiB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`repl-factor-${ni}`}>
                Replication Factor (1 - {form.size})
              </Label>
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
                <p className="text-destructive text-xs">
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
        <p className="text-destructive text-xs">
          {validateNamespaces(form.namespaces, form.size)}
        </p>
      )}

      {/* Shared persistent storage settings (shown when any namespace uses device) */}
      {isStoragePersistent && (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <span className="text-sm font-medium">Persistent Volume Settings</span>

          <div className="grid gap-2">
            <Label htmlFor="storage-class">Storage Class</Label>
            <Select
              value={form.storage?.storageClass || "standard"}
              onValueChange={(v) => {
                const base = form.storage ?? defaultStorage;
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
              value={form.storage?.size || "10Gi"}
              onValueChange={(v) => {
                const base = form.storage ?? defaultStorage;
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
                value={form.storage?.initMethod || "none"}
                onValueChange={(v) => {
                  const base = form.storage ?? {
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
                value={form.storage?.wipeMethod || "none"}
                onValueChange={(v) => {
                  const base = form.storage ?? {
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
            Init: how volumes are prepared on first use. Wipe: how dirty volumes are cleaned
            on pod restart.
          </p>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="cascade-delete"
              checked={form.storage?.cascadeDelete ?? true}
              onCheckedChange={(checked) => {
                const base = form.storage ?? defaultStorage;
                updateForm({ storage: { ...base, cascadeDelete: checked === true } });
              }}
            />
            <Label htmlFor="cascade-delete" className="text-sm font-normal">
              Delete PVCs when cluster is deleted (cascade delete)
            </Label>
          </div>
        </div>
      )}
    </>
  );
}

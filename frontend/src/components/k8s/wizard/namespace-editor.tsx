import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AerospikeNamespaceConfig } from "@/lib/api/types";
import { MAX_CE_NAMESPACES } from "@/lib/validations/k8s";

interface NamespaceEditorProps {
  namespaces: AerospikeNamespaceConfig[];
  clusterSize: number;
  onUpdateNamespace: (index: number, updates: Partial<AerospikeNamespaceConfig>) => void;
  onAddNamespace: () => void;
  onRemoveNamespace: (index: number) => void;
  /** Called when user switches a namespace to device storage and no storage is configured yet. */
  onDeviceStorageNeeded: () => void;
}

export function NamespaceEditor({
  namespaces,
  clusterSize,
  onUpdateNamespace,
  onAddNamespace,
  onRemoveNamespace,
  onDeviceStorageNeeded,
}: NamespaceEditorProps) {
  return (
    <>
      <p className="text-base-content/60 text-xs">
        Aerospike CE supports up to {MAX_CE_NAMESPACES} namespaces per cluster.
      </p>

      {namespaces.map((ns, ni) => {
        const nsIsDevice = ns.storageEngine.type === "device";
        return (
          <div key={`ns-${ni}`} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Namespace {ni + 1}</span>
              {namespaces.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveNamespace(ni)}
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
                onChange={(e) => onUpdateNamespace(ni, { name: e.target.value })}
              />
              {ns.name !== undefined && ns.name.trim().length === 0 && (
                <p className="text-error text-xs">Namespace name is required</p>
              )}
              {namespaces.length > 1 &&
                ns.name.trim().length > 0 &&
                namespaces.filter((o) => o.name.trim() === ns.name.trim()).length > 1 && (
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
                    onUpdateNamespace(ni, {
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
                    onUpdateNamespace(ni, {
                      storageEngine: { type: "device", filesize: 4294967296 },
                    });
                    onDeviceStorageNeeded();
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
                    onUpdateNamespace(ni, {
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
              <Label htmlFor={`repl-factor-${ni}`}>Replication Factor (1 - {clusterSize})</Label>
              <Input
                id={`repl-factor-${ni}`}
                type="number"
                min={1}
                max={clusterSize}
                value={ns.replicationFactor}
                onChange={(e) =>
                  onUpdateNamespace(ni, {
                    replicationFactor: Math.min(
                      clusterSize,
                      Math.max(1, parseInt(e.target.value) || 1),
                    ),
                  })
                }
              />
              {ns.replicationFactor > clusterSize && (
                <p className="text-error text-xs">
                  Replication factor ({ns.replicationFactor}) cannot exceed cluster size (
                  {clusterSize}).
                </p>
              )}
            </div>
          </div>
        );
      })}

      {namespaces.length < MAX_CE_NAMESPACES && (
        <Button type="button" variant="outline" size="sm" onClick={onAddNamespace}>
          Add Namespace
        </Button>
      )}
    </>
  );
}

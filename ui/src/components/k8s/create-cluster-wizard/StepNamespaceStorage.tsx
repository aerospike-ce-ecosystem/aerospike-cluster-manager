"use client"

import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { cx } from "@/lib/utils"
import { CE_LIMITS } from "@/lib/validations/k8s"
import type {
  AerospikeNamespaceConfig,
  CreateK8sClusterRequest,
  StorageVolumeConfig,
} from "@/lib/types/k8s"

interface StepNamespaceStorageProps {
  form: CreateK8sClusterRequest
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void
}

const MEMORY_SIZES: { label: string; bytes: number }[] = [
  { label: "1 GiB", bytes: 1_073_741_824 },
  { label: "2 GiB", bytes: 2_147_483_648 },
  { label: "4 GiB", bytes: 4_294_967_296 },
  { label: "8 GiB", bytes: 8_589_934_592 },
]

function defaultMemoryNamespace(
  clusterSize: number,
  index: number,
): AerospikeNamespaceConfig {
  return {
    name: index === 0 ? "test" : `ns-${index + 1}`,
    replicationFactor: Math.min(2, Math.max(1, clusterSize)),
    storageEngine: { type: "memory", dataSize: 1_073_741_824 },
  }
}

export function StepNamespaceStorage({
  form,
  updateForm,
}: StepNamespaceStorageProps) {
  const clusterSize = form.size ?? 1
  const namespaces: AerospikeNamespaceConfig[] =
    form.namespaces && form.namespaces.length > 0
      ? form.namespaces
      : [defaultMemoryNamespace(clusterSize, 0)]

  // Ensure the form always carries at least one namespace by syncing on mount when defaulted
  if (!form.namespaces || form.namespaces.length === 0) {
    updateForm({ namespaces })
  }

  const updateNamespace = (
    i: number,
    patch: Partial<AerospikeNamespaceConfig>,
  ) => {
    const next = namespaces.map((ns, idx) =>
      idx === i ? { ...ns, ...patch } : ns,
    )
    updateForm({ namespaces: next })
  }

  const addNamespace = () => {
    if (namespaces.length >= CE_LIMITS.MAX_CE_NAMESPACES) return
    updateForm({
      namespaces: [
        ...namespaces,
        defaultMemoryNamespace(clusterSize, namespaces.length),
      ],
    })
  }

  const removeNamespace = (i: number) => {
    if (namespaces.length <= 1) return
    updateForm({ namespaces: namespaces.filter((_, idx) => idx !== i) })
  }

  const legacyStorage: StorageVolumeConfig = (form.storage &&
  !("volumes" in form.storage)
    ? form.storage
    : undefined) ?? {
    storageClass: "standard",
    size: "10Gi",
    mountPath: "/opt/aerospike/data",
  }

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
          Namespace & Storage
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Aerospike CE supports up to {CE_LIMITS.MAX_CE_NAMESPACES} namespaces
          per cluster.
        </p>
      </div>

      {namespaces.map((ns, i) => {
        const storageType = ns.storageEngine?.type ?? "memory"
        return (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-md border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Namespace {i + 1}
              </h3>
              {namespaces.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs text-red-600 hover:text-red-700"
                  onClick={() => removeNamespace(i)}
                >
                  Remove
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ns-name-${i}`}>Namespace Name</Label>
                <Input
                  id={`ns-name-${i}`}
                  value={ns.name ?? ""}
                  onChange={(e) => updateNamespace(i, { name: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ns-rf-${i}`}>
                  Replication Factor (1-{clusterSize})
                </Label>
                <Input
                  id={`ns-rf-${i}`}
                  type="number"
                  min={1}
                  max={clusterSize}
                  value={String(ns.replicationFactor ?? 1)}
                  onChange={(e) =>
                    updateNamespace(i, {
                      replicationFactor:
                        Number.parseInt(e.target.value, 10) || 1,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Storage Type</Label>
              <div className="flex gap-2">
                <StorageTypeButton
                  selected={storageType === "memory"}
                  onClick={() =>
                    updateNamespace(i, {
                      storageEngine: {
                        type: "memory",
                        dataSize: 1_073_741_824,
                      },
                    })
                  }
                  label="In-Memory"
                />
                <StorageTypeButton
                  selected={storageType === "device"}
                  onClick={() =>
                    updateNamespace(i, {
                      storageEngine: {
                        type: "device",
                        file: "/opt/aerospike/data/ns.dat",
                        filesize: 4_294_967_296,
                      },
                    })
                  }
                  label="Persistent (Device)"
                />
              </div>
            </div>

            {storageType === "memory" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`ns-mem-${i}`}>Memory Size</Label>
                <select
                  id={`ns-mem-${i}`}
                  value={String(ns.storageEngine?.dataSize ?? 1_073_741_824)}
                  onChange={(e) =>
                    updateNamespace(i, {
                      storageEngine: {
                        ...ns.storageEngine,
                        type: "memory",
                        dataSize: Number.parseInt(e.target.value, 10),
                      },
                    })
                  }
                  className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  {MEMORY_SIZES.map((s) => (
                    <option key={s.label} value={s.bytes}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`ns-file-${i}`}>Device File Path</Label>
                  <Input
                    id={`ns-file-${i}`}
                    value={ns.storageEngine?.file ?? ""}
                    onChange={(e) =>
                      updateNamespace(i, {
                        storageEngine: {
                          ...ns.storageEngine,
                          type: "device",
                          file: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`ns-filesize-${i}`}>
                    Device File Size (bytes)
                  </Label>
                  <Input
                    id={`ns-filesize-${i}`}
                    type="number"
                    value={String(ns.storageEngine?.filesize ?? 4_294_967_296)}
                    onChange={(e) =>
                      updateNamespace(i, {
                        storageEngine: {
                          ...ns.storageEngine,
                          type: "device",
                          filesize: Number.parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}

      {namespaces.length < CE_LIMITS.MAX_CE_NAMESPACES && (
        <Button type="button" variant="secondary" onClick={addNamespace}>
          + Add Namespace
        </Button>
      )}

      <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">
          Persistent Volume (for workdir / device namespaces)
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage-class">Storage Class</Label>
            <Input
              id="storage-class"
              value={legacyStorage.storageClass ?? "standard"}
              onChange={(e) =>
                updateForm({
                  storage: { ...legacyStorage, storageClass: e.target.value },
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage-size">Size</Label>
            <Input
              id="storage-size"
              value={legacyStorage.size ?? "10Gi"}
              onChange={(e) =>
                updateForm({
                  storage: { ...legacyStorage, size: e.target.value },
                })
              }
              placeholder="10Gi"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="storage-mount">Mount Path</Label>
            <Input
              id="storage-mount"
              value={legacyStorage.mountPath ?? "/opt/aerospike/data"}
              onChange={(e) =>
                updateForm({
                  storage: { ...legacyStorage, mountPath: e.target.value },
                })
              }
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

function StorageTypeButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        selected
          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-200"
          : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-800 dark:text-gray-300",
      )}
    >
      {label}
    </button>
  )
}

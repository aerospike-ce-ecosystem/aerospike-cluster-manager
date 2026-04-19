"use client"

import { RiAddLine, RiDeleteBin2Line } from "@remixicon/react"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { cx } from "@/lib/utils"
import type { AerospikeNamespaceConfig } from "@/lib/types/k8s"

import type { WizardStepProps } from "./types"

interface NamespaceStorageStepProps extends WizardStepProps {
  storageClasses: string[]
}

// FIXME(stream-c): port full namespace/storage editor (multi-storage volumes, init/wipe methods,
// filesystem vs block mode, cascade delete) — see
// frontend/src/components/k8s/wizard/WizardNamespaceStorageStep.tsx + namespace-editor.tsx +
// volume-editor.tsx. The MVP here only supports memory namespaces + a single PV volume size.

const DEFAULT_NS: AerospikeNamespaceConfig = {
  name: "",
  replicationFactor: 1,
  storageEngine: { type: "memory", dataSize: 1_073_741_824 },
}

export function WizardNamespaceStorageStep({
  form,
  updateForm,
  storageClasses,
}: NamespaceStorageStepProps) {
  const namespaces = form.namespaces ?? []

  const updateNs = (idx: number, patch: Partial<AerospikeNamespaceConfig>) => {
    const next = [...namespaces]
    next[idx] = { ...next[idx], ...patch }
    updateForm({ namespaces: next })
  }

  const updateStorageEngine = (
    idx: number,
    patch: Partial<NonNullable<AerospikeNamespaceConfig["storageEngine"]>>,
  ) => {
    const next = [...namespaces]
    next[idx] = {
      ...next[idx],
      storageEngine: { ...next[idx].storageEngine, ...patch },
    }
    updateForm({ namespaces: next })
  }

  const addNs = () => {
    updateForm({
      namespaces: [
        ...namespaces,
        { ...DEFAULT_NS, name: `ns${namespaces.length + 1}` },
      ],
    })
  }

  const removeNs = (idx: number) => {
    updateForm({ namespaces: namespaces.filter((_, i) => i !== idx) })
  }

  // Storage volume (single PV, size only — advanced layout is FIXME)
  const currentVolumeSize =
    (form.storage as { size?: string } | undefined)?.size ?? "10Gi"
  const currentStorageClass =
    (form.storage as { storageClass?: string } | undefined)?.storageClass ??
    storageClasses[0] ??
    "standard"

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Aerospike namespaces</h3>
          <Button
            variant="ghost"
            onClick={addNs}
            className="gap-1 text-xs"
            disabled={namespaces.length >= 2}
          >
            <RiAddLine aria-hidden="true" className="size-3.5" />
            Add namespace
          </Button>
        </div>

        {namespaces.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No namespaces. Click &quot;Add namespace&quot; to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {namespaces.map((ns, idx) => (
              <div
                key={idx}
                className="rounded-md border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Namespace #{idx + 1}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => removeNs(idx)}
                    className="h-7 gap-1 px-2 text-xs text-red-600 dark:text-red-400"
                  >
                    <RiDeleteBin2Line aria-hidden="true" className="size-3.5" />
                    Remove
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`ns-name-${idx}`}>Name</Label>
                    <Input
                      id={`ns-name-${idx}`}
                      value={ns.name ?? ""}
                      onChange={(e) => updateNs(idx, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`ns-rf-${idx}`}>Replication factor</Label>
                    <Input
                      id={`ns-rf-${idx}`}
                      type="number"
                      min={1}
                      max={Math.max(1, form.size)}
                      value={ns.replicationFactor ?? 1}
                      onChange={(e) =>
                        updateNs(idx, {
                          replicationFactor: Math.max(
                            1,
                            parseInt(e.target.value, 10) || 1,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`ns-type-${idx}`}>Storage type</Label>
                    <Select
                      value={ns.storageEngine?.type ?? "memory"}
                      onValueChange={(v) =>
                        updateStorageEngine(idx, {
                          type: v as "memory" | "device",
                        })
                      }
                    >
                      <SelectTrigger id={`ns-type-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="memory">In-memory</SelectItem>
                        <SelectItem value="device">Device (file)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={`ns-size-${idx}`}>Data size (bytes)</Label>
                    <Input
                      id={`ns-size-${idx}`}
                      type="number"
                      min={1}
                      value={ns.storageEngine?.dataSize ?? 1_073_741_824}
                      onChange={(e) =>
                        updateStorageEngine(idx, {
                          dataSize: parseInt(e.target.value, 10) || 1,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Storage volume</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="storage-class">Storage class</Label>
            <Select
              value={currentStorageClass}
              onValueChange={(v) =>
                updateForm({
                  storage: {
                    ...(form.storage as Record<string, unknown> | null),
                    storageClass: v,
                  },
                })
              }
            >
              <SelectTrigger id="storage-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storageClasses.length === 0 && (
                  <SelectItem value={currentStorageClass}>
                    {currentStorageClass}
                  </SelectItem>
                )}
                {storageClasses.map((sc) => (
                  <SelectItem key={sc} value={sc}>
                    {sc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="storage-size">Volume size</Label>
            <Input
              id="storage-size"
              value={currentVolumeSize}
              placeholder="10Gi"
              onChange={(e) =>
                updateForm({
                  storage: {
                    ...(form.storage as Record<string, unknown> | null),
                    size: e.target.value,
                  },
                })
              }
            />
          </div>
        </div>
        <p
          className={cx(
            "rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400",
          )}
        >
          The wizard ships a single PV volume by default. For multi-volume
          layouts, edit the spec after creation.
        </p>
      </div>
    </div>
  )
}

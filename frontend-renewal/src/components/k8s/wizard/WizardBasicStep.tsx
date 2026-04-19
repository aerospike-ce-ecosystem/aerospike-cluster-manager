"use client"

import { Checkbox } from "@/components/Checkbox"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { AEROSPIKE_IMAGES, CE_LIMITS } from "@/lib/constants"

import type { WizardStepProps } from "./types"

interface BasicStepProps extends WizardStepProps {
  k8sNamespaces: string[]
  loadingNamespaces: boolean
}

// FIXME(stream-c): port full resource validation with CPU/memory warnings and auto-fix —
// see frontend/src/components/k8s/wizard/WizardBasicStep.tsx.

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

export function validateK8sName(name: string): string | null {
  if (!name) return "Name is required"
  if (name.length > 63) return "Max 63 characters"
  if (!NAME_PATTERN.test(name))
    return "Lowercase letters, numbers, and hyphens only (DNS-1123)"
  return null
}

export function WizardBasicStep({
  form,
  updateForm,
  k8sNamespaces,
  loadingNamespaces,
}: BasicStepProps) {
  const nameError = form.name ? validateK8sName(form.name) : null

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="cluster-name">Cluster name</Label>
        <Input
          id="cluster-name"
          placeholder="my-aerospike"
          value={form.name}
          onChange={(e) => updateForm({ name: e.target.value.toLowerCase() })}
        />
        {nameError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Lowercase letters, numbers, and hyphens only (K8s DNS name).
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="k8s-namespace">Namespace</Label>
          <Select
            value={form.namespace}
            onValueChange={(v) => updateForm({ namespace: v })}
            disabled={loadingNamespaces}
          >
            <SelectTrigger id="k8s-namespace">
              <SelectValue
                placeholder={
                  loadingNamespaces
                    ? "Loading namespaces..."
                    : "Select a namespace"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {k8sNamespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>
                  {ns}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cluster-size">
            Size (1-{CE_LIMITS.MAX_NODES} nodes)
          </Label>
          <Input
            id="cluster-size"
            type="number"
            min={1}
            max={CE_LIMITS.MAX_NODES}
            value={form.size}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              updateForm({
                size: Math.min(
                  CE_LIMITS.MAX_NODES,
                  Math.max(1, Number.isNaN(v) ? 1 : v),
                ),
              })
            }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="aerospike-image">Aerospike image</Label>
        <Select
          value={form.image}
          onValueChange={(v) => updateForm({ image: v })}
        >
          <SelectTrigger id="aerospike-image">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AEROSPIKE_IMAGES.map((img) => (
              <SelectItem key={img} value={img}>
                {img}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="auto-connect"
          checked={form.autoConnect ?? true}
          onCheckedChange={(c) => updateForm({ autoConnect: c === true })}
        />
        <Label htmlFor="auto-connect">Auto-connect after creation</Label>
      </div>
    </div>
  )
}

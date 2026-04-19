"use client"

import { RiArrowLeftLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { ackoSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Checkbox } from "@/components/Checkbox"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { listK8sStorageClasses } from "@/lib/api/k8s"
import { useK8sTemplateStore } from "@/stores/k8s-template-store"
import type {
  CreateK8sTemplateRequest,
  TemplateServiceConfig,
} from "@/lib/types/k8s"

// FIXME(stream-c): port the full service-extra-params repeater UI —
// see frontend/src/app/k8s/templates/new/page.tsx (595 lines). Covers: sidecars,
// custom-extra-params repeater, and full network-config heartbeat tuning.

export default function CreateTemplatePage() {
  const router = useRouter()
  const { createTemplate } = useK8sTemplateStore()

  const [storageClasses, setStorageClasses] = useState<string[]>([])

  // Basic
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [image, setImage] = useState("aerospike:ce-8.1.1.1")
  const [size, setSize] = useState<number | undefined>(undefined)

  // Scheduling
  const [antiAffinity, setAntiAffinity] = useState<
    "none" | "preferred" | "required"
  >("none")
  const [podManagementPolicy, setPodManagementPolicy] = useState<
    "OrderedReady" | "Parallel"
  >("OrderedReady")

  // Resources
  const [includeResources, setIncludeResources] = useState(false)
  const [cpuReq, setCpuReq] = useState("500m")
  const [memReq, setMemReq] = useState("1Gi")
  const [cpuLim, setCpuLim] = useState("2")
  const [memLim, setMemLim] = useState("4Gi")

  // Monitoring
  const [enableMonitoring, setEnableMonitoring] = useState(false)
  const [monitoringPort, setMonitoringPort] = useState(9145)

  // Storage
  const [includeStorage, setIncludeStorage] = useState(false)
  const [storageClass, setStorageClass] = useState("standard")
  const [volumeSize, setVolumeSize] = useState("10Gi")

  // Network
  const [accessType, setAccessType] = useState<
    "pod" | "hostInternal" | "hostExternal" | "configuredIP"
  >("pod")

  // Rack
  const [maxRacksPerNode, setMaxRacksPerNode] = useState<number | undefined>(
    undefined,
  )

  // Service config
  const [includeServiceConfig, setIncludeServiceConfig] = useState(false)
  const [protoFdMax, setProtoFdMax] = useState<number | undefined>(undefined)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listK8sStorageClasses()
      .then(setStorageClasses)
      .catch(() => {
        /* silently ignore */
      })
  }, [])

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Template name is required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data: CreateK8sTemplateRequest = { name: name.trim() }
      if (description.trim()) data.description = description.trim()
      if (image) data.image = image
      if (size != null && size > 0) data.size = size
      if (includeResources) {
        data.resources = {
          requests: { cpu: cpuReq, memory: memReq },
          limits: { cpu: cpuLim, memory: memLim },
        }
      }
      if (enableMonitoring) {
        data.monitoring = { enabled: true, port: monitoringPort }
      }
      if (antiAffinity !== "none" || podManagementPolicy !== "OrderedReady") {
        data.scheduling = {}
        if (antiAffinity !== "none")
          data.scheduling.podAntiAffinityLevel = antiAffinity
        if (podManagementPolicy !== "OrderedReady")
          data.scheduling.podManagementPolicy = podManagementPolicy
      }
      if (includeStorage) {
        data.storage = {
          storageClassName: storageClass,
          volumeMode: "Filesystem",
          accessModes: ["ReadWriteOnce"],
          size: volumeSize,
        }
      }
      if (accessType !== "pod") {
        data.networkPolicy = { accessType }
      }
      if (maxRacksPerNode != null && maxRacksPerNode > 0) {
        data.rackConfig = { maxRacksPerNode }
      }
      if (includeServiceConfig) {
        const svc: TemplateServiceConfig = {}
        if (protoFdMax != null) svc.protoFdMax = protoFdMax
        if (svc.protoFdMax != null) data.serviceConfig = svc
      }

      await createTemplate(data)
      router.push(ackoSections.templates())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Create AerospikeClusterTemplate"
        description="Define a reusable cluster configuration template."
        actions={
          <Button variant="ghost" asChild className="gap-1">
            <Link href={ackoSections.templates()}>
              <RiArrowLeftLine aria-hidden="true" className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      <InlineAlert message={error} />

      <div className="mx-auto w-full max-w-3xl space-y-5">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Basic information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tmpl-name">Template name</Label>
              <Input
                id="tmpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-template"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cluster-scoped (no namespace).
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tmpl-image">Default image</Label>
              <Input
                id="tmpl-image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tmpl-size">Default size</Label>
              <Input
                id="tmpl-size"
                type="number"
                min={1}
                max={8}
                value={size ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setSize(
                    Number.isNaN(v) ? undefined : Math.min(8, Math.max(1, v)),
                  )
                }}
                placeholder="Optional"
                disabled={loading}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="tmpl-description">Description</Label>
              <Input
                id="tmpl-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="e.g. Multi-rack production template"
                disabled={loading}
                maxLength={500}
              />
              <p className="text-right text-xs text-gray-500 dark:text-gray-400">
                {description.length}/500
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Scheduling</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Pod anti-affinity</Label>
              <Select
                value={antiAffinity}
                onValueChange={(v) => setAntiAffinity(v as typeof antiAffinity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="required">Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Pod management policy</Label>
              <Select
                value={podManagementPolicy}
                onValueChange={(v) =>
                  setPodManagementPolicy(v as typeof podManagementPolicy)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OrderedReady">OrderedReady</SelectItem>
                  <SelectItem value="Parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-resources"
              checked={includeResources}
              onCheckedChange={(c) => setIncludeResources(c === true)}
            />
            <Label
              htmlFor="tmpl-resources"
              className="cursor-pointer font-semibold"
            >
              Include resource defaults
            </Label>
          </div>
          {includeResources && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">CPU request</Label>
                <Input
                  value={cpuReq}
                  onChange={(e) => setCpuReq(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Memory request</Label>
                <Input
                  value={memReq}
                  onChange={(e) => setMemReq(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">CPU limit</Label>
                <Input
                  value={cpuLim}
                  onChange={(e) => setCpuLim(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Memory limit</Label>
                <Input
                  value={memLim}
                  onChange={(e) => setMemLim(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-storage"
              checked={includeStorage}
              onCheckedChange={(c) => setIncludeStorage(c === true)}
            />
            <Label
              htmlFor="tmpl-storage"
              className="cursor-pointer font-semibold"
            >
              Include storage defaults
            </Label>
          </div>
          {includeStorage && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">Storage class</Label>
                <Select value={storageClass} onValueChange={setStorageClass}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageClasses.length === 0 && (
                      <SelectItem value={storageClass}>
                        {storageClass}
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
                <Label className="text-xs">Volume size</Label>
                <Input
                  value={volumeSize}
                  onChange={(e) => setVolumeSize(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Monitoring & network</h3>
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-monitoring"
              checked={enableMonitoring}
              onCheckedChange={(c) => setEnableMonitoring(c === true)}
            />
            <Label htmlFor="tmpl-monitoring" className="cursor-pointer text-xs">
              Enable Prometheus monitoring
            </Label>
          </div>
          {enableMonitoring && (
            <div className="grid gap-1.5 sm:w-1/2">
              <Label className="text-xs">Metrics port</Label>
              <Input
                type="number"
                min={1024}
                max={65535}
                value={monitoringPort}
                onChange={(e) =>
                  setMonitoringPort(parseInt(e.target.value, 10) || 9145)
                }
                disabled={loading}
              />
            </div>
          )}
          <div className="grid gap-1.5 sm:w-1/2">
            <Label className="text-xs">Network access type</Label>
            <Select
              value={accessType}
              onValueChange={(v) => setAccessType(v as typeof accessType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP</SelectItem>
                <SelectItem value="hostInternal">Host internal</SelectItem>
                <SelectItem value="hostExternal">Host external</SelectItem>
                <SelectItem value="configuredIP">Configured IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold">Rack & service</h3>
          <div className="grid gap-1.5 sm:w-1/2">
            <Label className="text-xs">Max racks per node</Label>
            <Input
              type="number"
              min={1}
              value={maxRacksPerNode ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setMaxRacksPerNode(Number.isNaN(v) ? undefined : Math.max(1, v))
              }}
              placeholder="No limit"
              disabled={loading}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="tmpl-service-config"
              checked={includeServiceConfig}
              onCheckedChange={(c) => setIncludeServiceConfig(c === true)}
            />
            <Label
              htmlFor="tmpl-service-config"
              className="cursor-pointer text-xs"
            >
              Include service config (proto-fd-max)
            </Label>
          </div>
          {includeServiceConfig && (
            <div className="grid gap-1.5 sm:w-1/2">
              <Label className="text-xs">proto-fd-max</Label>
              <Input
                type="number"
                min={0}
                value={protoFdMax ?? ""}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setProtoFdMax(Number.isNaN(v) ? undefined : Math.max(0, v))
                }}
                placeholder="Default (15000)"
                disabled={loading}
              />
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" asChild disabled={loading}>
            <Link href={ackoSections.templates()}>Cancel</Link>
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            isLoading={loading}
            disabled={!name.trim()}
          >
            Create template
          </Button>
        </div>
      </div>
    </main>
  )
}

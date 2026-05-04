"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/Button"
import { ApiError } from "@/lib/api/client"
import { useUiStore } from "@/stores/ui-store"
import {
  createK8sCluster,
  getK8sTemplate,
  listK8sNamespaces,
  listK8sTemplates,
} from "@/lib/api/k8s"
import type {
  CreateK8sClusterRequest,
  K8sTemplateSummary,
} from "@/lib/types/k8s"
import {
  CE_LIMITS,
  parseCpuMillis,
  parseMemoryBytes,
  validateImageNotEnterprise,
  validateK8sCpu,
  validateK8sMemory,
  validateK8sName,
  validateNamespaces,
} from "@/lib/validations/k8s"

import { StepAdvanced } from "./StepAdvanced"
import { StepBasic } from "./StepBasic"
import { StepCreationMode } from "./StepCreationMode"
import { StepNamespaceStorage } from "./StepNamespaceStorage"
import { StepReview } from "./StepReview"
import { Stepper } from "./Stepper"
import {
  STEP_LABELS_SCRATCH,
  STEP_LABELS_TEMPLATE,
  type CreationMode,
} from "./types"

const INITIAL_FORM: CreateK8sClusterRequest = {
  name: "",
  namespace: "",
  size: 1,
  image: "aerospike:ce-8.1.1.1",
  autoConnect: true,
  resources: {
    requests: { cpu: "500m", memory: "1Gi" },
    limits: { cpu: "2", memory: "4Gi" },
  },
  namespaces: [
    {
      name: "test",
      replicationFactor: 1,
      storageEngine: { type: "memory", dataSize: 1_073_741_824 },
    },
  ],
  storage: {
    storageClass: "standard",
    size: "10Gi",
    mountPath: "/opt/aerospike/data",
  },
}

function buildFormUpdatesFromTemplate(
  spec: Record<string, unknown>,
  name: string,
): Partial<CreateK8sClusterRequest> {
  const updates: Partial<CreateK8sClusterRequest> = { templateRef: { name } }
  if (typeof spec.image === "string") updates.image = spec.image
  if (
    typeof spec.size === "number" &&
    spec.size >= 1 &&
    spec.size <= CE_LIMITS.MAX_NODES
  ) {
    updates.size = spec.size
  }
  if (spec.resources && typeof spec.resources === "object") {
    updates.resources = spec.resources as CreateK8sClusterRequest["resources"]
  }
  if (spec.monitoring && typeof spec.monitoring === "object") {
    updates.monitoring =
      spec.monitoring as CreateK8sClusterRequest["monitoring"]
  }
  if (spec.storage && typeof spec.storage === "object") {
    updates.storage = spec.storage as CreateK8sClusterRequest["storage"]
  }
  return updates
}

function isEmptyRecord(r: Record<string, unknown> | null | undefined): boolean {
  return !r || Object.keys(r).length === 0
}

function cleanupPayload(
  form: CreateK8sClusterRequest,
): CreateK8sClusterRequest {
  const p: CreateK8sClusterRequest = { ...form }

  if (p.rollingUpdate) {
    const { batchSize, maxUnavailable, disablePDB } = p.rollingUpdate
    if (
      batchSize === undefined &&
      maxUnavailable === undefined &&
      !disablePDB
    ) {
      delete (p as { rollingUpdate?: unknown }).rollingUpdate
    }
  }

  if (p.monitoring && !p.monitoring.enabled) {
    delete (p as { monitoring?: unknown }).monitoring
  }

  if (p.acl && !p.acl.enabled) {
    delete (p as { acl?: unknown }).acl
  }

  if (
    p.rackConfig &&
    (!p.rackConfig.racks || p.rackConfig.racks.length === 0)
  ) {
    const {
      namespaces,
      scaleDownBatchSize,
      maxIgnorablePods,
      rollingUpdateBatchSize,
    } = p.rackConfig
    if (
      !namespaces?.length &&
      !scaleDownBatchSize &&
      !maxIgnorablePods &&
      !rollingUpdateBatchSize
    ) {
      delete (p as { rackConfig?: unknown }).rackConfig
    }
  }

  if (p.sidecars && p.sidecars.length === 0)
    delete (p as { sidecars?: unknown }).sidecars
  if (p.initContainers && p.initContainers.length === 0)
    delete (p as { initContainers?: unknown }).initContainers

  if (p.k8sNodeBlockList && p.k8sNodeBlockList.length === 0) {
    delete (p as { k8sNodeBlockList?: unknown }).k8sNodeBlockList
  }

  if (
    p.bandwidthConfig &&
    !p.bandwidthConfig.ingress &&
    !p.bandwidthConfig.egress
  ) {
    delete (p as { bandwidthConfig?: unknown }).bandwidthConfig
  }

  if (p.validationPolicy && p.validationPolicy.skipWorkDirValidate !== true) {
    delete (p as { validationPolicy?: unknown }).validationPolicy
  }

  if (
    p.headlessService &&
    isEmptyRecord(p.headlessService.labels) &&
    isEmptyRecord(p.headlessService.annotations)
  ) {
    delete (p as { headlessService?: unknown }).headlessService
  }
  if (
    p.podService &&
    isEmptyRecord(p.podService.labels) &&
    isEmptyRecord(p.podService.annotations)
  ) {
    delete (p as { podService?: unknown }).podService
  }

  if (p.podScheduling) {
    const ps = p.podScheduling
    const hasAny =
      !isEmptyRecord(ps.nodeSelector ?? undefined) ||
      (ps.tolerations && ps.tolerations.length > 0) ||
      Boolean(ps.multiPodPerHost) ||
      Boolean(ps.hostNetwork) ||
      Boolean(ps.serviceAccountName) ||
      ps.readinessGateEnabled !== undefined ||
      ps.podManagementPolicy !== undefined ||
      (ps.metadata &&
        (!isEmptyRecord(ps.metadata.labels ?? undefined) ||
          !isEmptyRecord(ps.metadata.annotations ?? undefined)))
    if (!hasAny) delete (p as { podScheduling?: unknown }).podScheduling
  }

  if (p.networkPolicy && p.networkPolicy.accessType === "pod") {
    const { alternateAccessType, fabricType } = p.networkPolicy
    if (!alternateAccessType && !fabricType) {
      delete (p as { networkPolicy?: unknown }).networkPolicy
    }
  }

  return p
}

export function CreateClusterWizard() {
  const router = useRouter()

  const [mode, setMode] = useState<CreationMode>("scratch")
  const [step, setStep] = useState(0)
  const [maxReachedStep, setMaxReachedStep] = useState(0)
  const [form, setForm] = useState<CreateK8sClusterRequest>(INITIAL_FORM)

  const [templates, setTemplates] = useState<K8sTemplateSummary[]>([])
  const [selectedTemplateName, setSelectedTemplateName] = useState<
    string | null
  >(null)
  const [templateLoading, setTemplateLoading] = useState(false)

  const [namespacesList, setNamespacesList] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const labels = mode === "scratch" ? STEP_LABELS_SCRATCH : STEP_LABELS_TEMPLATE

  const updateForm = (updates: Partial<CreateK8sClusterRequest>) => {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  // Fetch K8s namespaces & templates on mount
  useEffect(() => {
    listK8sNamespaces()
      .then((list) => {
        setNamespacesList(list)
        setForm((prev) =>
          prev.namespace
            ? prev
            : {
                ...prev,
                namespace: list.includes("default")
                  ? "default"
                  : (list[0] ?? ""),
              },
        )
      })
      .catch(() => {
        /* leave namespacesList empty; user can type manually if needed */
      })
    listK8sTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  const handleModeChange = (next: CreationMode) => {
    setMode(next)
    if (next === "scratch") {
      setSelectedTemplateName(null)
      setForm((prev) => {
        const copy: CreateK8sClusterRequest = { ...prev }
        delete (copy as { templateRef?: unknown }).templateRef
        delete (copy as { templateOverrides?: unknown }).templateOverrides
        return copy
      })
    }
    setStep(0)
    setMaxReachedStep(0)
  }

  const handleSelectTemplate = async (name: string) => {
    setSelectedTemplateName(name)
    setTemplateLoading(true)
    try {
      const detail = await getK8sTemplate(name)
      const spec = (detail as { spec?: Record<string, unknown> }).spec ?? {}
      const updates = buildFormUpdatesFromTemplate(spec, name)
      setForm((prev) => ({ ...prev, ...updates }))
    } finally {
      setTemplateLoading(false)
    }
  }

  // Validation per step
  const stepError = useMemo<string | null>(() => {
    if (mode === "scratch") {
      if (step === 1) {
        // Basic & Resources
        const nameErr = validateK8sName(form.name ?? "")
        if (nameErr) return `Name: ${nameErr}`
        if (!form.namespace) return "Kubernetes namespace is required"
        if (!form.size || form.size < 1 || form.size > CE_LIMITS.MAX_NODES)
          return `Size must be between 1 and ${CE_LIMITS.MAX_NODES}`
        const imgErr = validateImageNotEnterprise(form.image ?? "")
        if (imgErr) return imgErr
        const req = form.resources?.requests
        const lim = form.resources?.limits
        for (const [label, value] of [
          ["CPU request", req?.cpu],
          ["CPU limit", lim?.cpu],
        ] as const) {
          const e = validateK8sCpu(value ?? "")
          if (e) return `${label}: ${e}`
        }
        for (const [label, value] of [
          ["Memory request", req?.memory],
          ["Memory limit", lim?.memory],
        ] as const) {
          const e = validateK8sMemory(value ?? "")
          if (e) return `${label}: ${e}`
        }
        if (parseCpuMillis(lim?.cpu ?? "0") < parseCpuMillis(req?.cpu ?? "0"))
          return "CPU limit must be >= CPU request"
        if (
          parseMemoryBytes(lim?.memory ?? "0") <
          parseMemoryBytes(req?.memory ?? "0")
        )
          return "Memory limit must be >= Memory request"
      }
      if (step === 2) {
        return validateNamespaces(form.namespaces ?? [], form.size ?? 1)
      }
    } else {
      if (step === 0) {
        if (!selectedTemplateName) return "Select a template to continue"
      }
      if (step === 1) {
        const nameErr = validateK8sName(form.name ?? "")
        if (nameErr) return `Name: ${nameErr}`
        if (!form.namespace) return "Kubernetes namespace is required"
      }
      if (step === 2) {
        return validateNamespaces(form.namespaces ?? [], form.size ?? 1)
      }
    }
    return null
  }, [form, mode, step, selectedTemplateName])

  const goNext = () => {
    if (stepError) return
    const next = step + 1
    setStep(next)
    setMaxReachedStep((m) => Math.max(m, next))
  }

  const goBack = () => {
    if (step === 0) {
      router.push("/clusters")
      return
    }
    setStep((s) => Math.max(0, s - 1))
  }

  const goTo = (i: number) => {
    if (i <= maxReachedStep) setStep(i)
  }

  const handleCreate = async () => {
    setSubmitError(null)
    setSubmitting(true)
    try {
      const payload = cleanupPayload(form)
      // Attach the auto-created connection to the workspace the user is
      // currently viewing — otherwise the new cluster only appears after
      // they switch back to Default.
      payload.workspaceId = useUiStore.getState().currentWorkspaceId
      await createK8sCluster(payload)
      router.push("/clusters")
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.detail || err.message)
      } else if (err instanceof Error) {
        setSubmitError(err.message)
      } else {
        setSubmitError("Failed to create cluster.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = step === labels.length - 1

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
          Create Cluster
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Deploy a new Aerospike CE cluster on Kubernetes.
        </p>
      </header>

      <Stepper
        labels={labels}
        currentIndex={step}
        maxReachedIndex={maxReachedStep}
        onSelect={goTo}
      />

      {mode === "scratch" ? (
        step === 0 ? (
          <StepCreationMode
            mode={mode}
            onModeChange={handleModeChange}
            templates={templates}
            templateLoading={templateLoading}
            selectedTemplateName={selectedTemplateName}
            onSelectTemplate={handleSelectTemplate}
          />
        ) : step === 1 ? (
          <StepBasic
            form={form}
            namespaces={namespacesList}
            updateForm={updateForm}
          />
        ) : step === 2 ? (
          <StepNamespaceStorage form={form} updateForm={updateForm} />
        ) : step === 3 ? (
          <StepAdvanced form={form} updateForm={updateForm} />
        ) : (
          <StepReview form={form} templateName={selectedTemplateName} />
        )
      ) : step === 0 ? (
        <StepCreationMode
          mode={mode}
          onModeChange={handleModeChange}
          templates={templates}
          templateLoading={templateLoading}
          selectedTemplateName={selectedTemplateName}
          onSelectTemplate={handleSelectTemplate}
        />
      ) : step === 1 ? (
        <StepBasic
          form={form}
          namespaces={namespacesList}
          updateForm={updateForm}
          templateMode
        />
      ) : step === 2 ? (
        <StepNamespaceStorage form={form} updateForm={updateForm} />
      ) : (
        <StepReview form={form} templateName={selectedTemplateName} />
      )}

      {stepError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          {stepError}
        </div>
      )}
      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {submitError}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={goBack} disabled={submitting}>
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {isLastStep ? (
          <Button
            variant="primary"
            onClick={handleCreate}
            isLoading={submitting}
            loadingText="Creating…"
          >
            Create Cluster
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={goNext}
            disabled={Boolean(stepError)}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}

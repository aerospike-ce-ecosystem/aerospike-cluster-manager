"use client"

import { RiArrowLeftLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { ackoSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { ProgressBar } from "@/components/ProgressBar"
import { FIXME } from "@/components/k8s/wizard/FIXME"
import {
  validateK8sName,
  WizardBasicStep,
} from "@/components/k8s/wizard/WizardBasicStep"
import { WizardNamespaceStorageStep } from "@/components/k8s/wizard/WizardNamespaceStorageStep"
import { WizardResourcesStep } from "@/components/k8s/wizard/WizardResourcesStep"
import { WizardReviewStep } from "@/components/k8s/wizard/WizardReviewStep"
import { WizardRollingUpdateStep } from "@/components/k8s/wizard/WizardRollingUpdateStep"
import type { WizardFormState } from "@/components/k8s/wizard/types"
import {
  createK8sCluster,
  listK8sNamespaces,
  listK8sStorageClasses,
} from "@/lib/api/k8s"
import { AEROSPIKE_IMAGES } from "@/lib/constants"
import { cx } from "@/lib/utils"

// MVP wizard ships 5 of 9 steps. The remaining 4 (Monitoring, ACL, RackConfig, Advanced)
// are stubbed; users can apply those settings post-create via CR edit.

const STEPS = [
  { key: "basic", label: "Basic", ported: true },
  { key: "namespace-storage", label: "Namespace & Storage", ported: true },
  { key: "resources", label: "Resources", ported: true },
  { key: "rolling-update", label: "Rolling Update", ported: true },
  { key: "monitoring", label: "Monitoring", ported: false }, // FIXME(stream-c)
  { key: "acl", label: "ACL / Security", ported: false }, // FIXME(stream-c)
  { key: "rack-config", label: "Rack Config", ported: false }, // FIXME(stream-c)
  { key: "advanced", label: "Advanced", ported: false }, // FIXME(stream-c)
  { key: "review", label: "Review", ported: true },
] as const

export default function CreateAckoClusterPage() {
  const router = useRouter()

  const [k8sNamespaces, setK8sNamespaces] = useState<string[]>([])
  const [storageClasses, setStorageClasses] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [form, setForm] = useState<WizardFormState>({
    name: "",
    namespace: "",
    size: 1,
    image: AEROSPIKE_IMAGES[0],
    namespaces: [
      {
        name: "test",
        replicationFactor: 1,
        storageEngine: { type: "memory", dataSize: 1_073_741_824 },
      },
    ],
    resources: {
      requests: { cpu: "500m", memory: "1Gi" },
      limits: { cpu: "2", memory: "4Gi" },
    },
    enableDynamicConfig: false,
    autoConnect: true,
  })

  const [step, setStep] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    const errors: string[] = []
    Promise.allSettled([
      listK8sNamespaces()
        .then((ns) => {
          if (cancelled) return
          setK8sNamespaces(ns)
          setForm((prev) => ({
            ...prev,
            namespace:
              prev.namespace ||
              (ns.includes("default") ? "default" : (ns[0] ?? "")),
          }))
        })
        .catch((err) => {
          errors.push(
            `Failed to fetch K8s namespaces: ${err instanceof Error ? err.message : String(err)}`,
          )
        }),
      listK8sStorageClasses()
        .then((sc) => {
          if (!cancelled) setStorageClasses(sc)
        })
        .catch((err) => {
          errors.push(
            `Failed to fetch storage classes: ${err instanceof Error ? err.message : String(err)}`,
          )
        }),
    ]).finally(() => {
      if (cancelled) return
      setFetchError(
        errors.length > 0 ? `${errors.join(". ")}. Using defaults.` : null,
      )
      setLoadingOptions(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const updateForm = (patch: Partial<WizardFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  const canProceed = (): boolean => {
    const current = STEPS[step]
    if (current.key === "basic") {
      if (validateK8sName(form.name) !== null) return false
      if (!form.namespace) return false
      return true
    }
    if (current.key === "namespace-storage") {
      if ((form.namespaces ?? []).length === 0) return false
      for (const ns of form.namespaces ?? []) {
        if (!ns.name?.trim()) return false
      }
      return true
    }
    return true
  }

  const handleCreate = async () => {
    setCreateError(null)
    setCreating(true)
    try {
      const payload = { ...form }
      if (payload.rollingUpdate) {
        const ru = payload.rollingUpdate
        if (ru.batchSize == null && !ru.maxUnavailable && !ru.disablePDB) {
          payload.rollingUpdate = null
        }
      }
      await createK8sCluster(payload)
      router.push("/acko/clusters")
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const isLastStep = step === STEPS.length - 1
  const currentStep = STEPS[step]

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Create ACKO cluster"
        description="Deploy a new Aerospike CE cluster on Kubernetes via the Aerospike Operator."
        actions={
          <Button variant="ghost" asChild className="gap-1">
            <Link href={ackoSections.list()}>
              <RiArrowLeftLine aria-hidden="true" className="size-4" />
              Back
            </Link>
          </Button>
        }
      />

      <InlineAlert message={fetchError} variant="warning" />
      <InlineAlert message={createError} variant="error" />

      <div className="mx-auto w-full max-w-3xl space-y-6">
        {/* Step indicator */}
        <nav aria-label="Wizard steps" className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <p className="font-medium text-gray-500 dark:text-gray-400">
              Step {step + 1} of {STEPS.length}{" "}
              <span className="mx-1.5 text-gray-300 dark:text-gray-700">—</span>
              <span className="text-gray-900 dark:text-gray-50">
                {currentStep.label}
              </span>
            </p>
          </div>
          <ProgressBar value={((step + 1) / STEPS.length) * 100} />
          <ol className="flex flex-wrap gap-2" role="tablist">
            {STEPS.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  disabled={i > step}
                  aria-current={i === step ? "step" : undefined}
                  className={cx(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                    i === step
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300"
                      : i < step
                        ? "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900"
                        : "text-gray-400 dark:text-gray-600",
                  )}
                >
                  <span
                    className={cx(
                      "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                      i === step
                        ? "bg-indigo-600 text-white"
                        : i < step
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                          : "bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
                    )}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                  {!s.ported && (
                    <span className="text-[10px] italic text-amber-600 dark:text-amber-400">
                      stub
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Step body */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-900 dark:bg-[#090E1A]">
          {currentStep.key === "basic" && (
            <WizardBasicStep
              form={form}
              updateForm={updateForm}
              k8sNamespaces={k8sNamespaces}
              loadingNamespaces={loadingOptions}
            />
          )}
          {currentStep.key === "namespace-storage" && (
            <WizardNamespaceStorageStep
              form={form}
              updateForm={updateForm}
              storageClasses={storageClasses}
            />
          )}
          {currentStep.key === "resources" && (
            <WizardResourcesStep form={form} updateForm={updateForm} />
          )}
          {currentStep.key === "rolling-update" && (
            <WizardRollingUpdateStep form={form} updateForm={updateForm} />
          )}
          {currentStep.key === "monitoring" && (
            <FIXME note="port WizardMonitoringStep from frontend/src/components/k8s/wizard/WizardMonitoringStep.tsx" />
          )}
          {currentStep.key === "acl" && (
            <FIXME note="port WizardAclStep from frontend/src/components/k8s/wizard/WizardAclStep.tsx" />
          )}
          {currentStep.key === "rack-config" && (
            <FIXME note="port WizardRackConfigStep from frontend/src/components/k8s/wizard/WizardRackConfigStep.tsx" />
          )}
          {currentStep.key === "advanced" && (
            <FIXME note="port WizardAdvancedStep from frontend/src/components/k8s/wizard/WizardAdvancedStep.tsx (includes sidecars, validation policy, pod scheduling)" />
          )}
          {currentStep.key === "review" && (
            <WizardReviewStep form={form} updateForm={updateForm} />
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex justify-between">
          <Button
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || creating}
          >
            Back
          </Button>
          {isLastStep ? (
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              isLoading={creating}
              disabled={!form.name || !form.namespace}
            >
              Create cluster
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </main>
  )
}

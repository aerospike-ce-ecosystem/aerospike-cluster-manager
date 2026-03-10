"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/common/loading-button";
import { InlineAlert } from "@/components/common/inline-alert";
import { useK8sClusterStore } from "@/stores/k8s-cluster-store";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import {
  validateK8sName,
  validateK8sCpu,
  validateK8sMemory,
  validateNamespaces,
  parseCpuMillis,
  parseMemoryBytes,
} from "@/lib/validations/k8s";
import { AEROSPIKE_IMAGES } from "@/lib/constants";
import { useToastStore } from "@/stores/toast-store";
import { Progress } from "@/components/ui/progress";
import type {
  CreateK8sClusterRequest,
  MonitoringConfig,
  ACLConfig,
  RollingUpdateConfig,
  K8sNodeInfo,
  K8sTemplateDetail,
  StorageVolumeConfig,
} from "@/lib/api/types";
import { buildFormUpdatesFromTemplate } from "./wizard/template-prefill";
import {
  WizardCreationModeStep,
  WizardBasicStep,
  WizardNamespaceStorageStep,
  WizardAdvancedStep,
  WizardReviewStep,
  WizardTemplateNameStep,
} from "./wizard";

const SCRATCH_STEPS = [
  "Creation Mode",
  "Basic & Resources",
  "Namespace & Storage",
  "Advanced",
  "Review",
];

const TEMPLATE_STEPS = ["Creation Mode", "Name & Namespace", "Namespace & Storage", "Review"];

export function K8sClusterWizard() {
  const router = useRouter();
  const { createCluster, templates, fetchTemplates } = useK8sClusterStore();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [k8sNamespaces, setK8sNamespaces] = useState<string[]>([]);
  const [storageClasses, setStorageClasses] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchingOptions, setFetchingOptions] = useState(true);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [k8sSecrets, setK8sSecrets] = useState<string[]>([]);

  // Template mode state
  const [creationMode, setCreationMode] = useState<"scratch" | "template">("scratch");
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
  const [templateDetail, setTemplateDetail] = useState<K8sTemplateDetail | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const isTemplateMode = creationMode === "template";
  const STEPS = isTemplateMode ? TEMPLATE_STEPS : SCRATCH_STEPS;

  const DEFAULT_RESOURCES = {
    requests: { cpu: "500m", memory: "1Gi" },
    limits: { cpu: "2", memory: "4Gi" },
  };

  const DEFAULT_STORAGE: StorageVolumeConfig = {
    storageClass: "standard",
    size: "10Gi",
    mountPath: "/opt/aerospike/data",
  };

  const [form, setForm] = useState<CreateK8sClusterRequest>({
    name: "",
    namespace: "",
    size: 1,
    image: AEROSPIKE_IMAGES[0],
    namespaces: [
      {
        name: "test",
        replicationFactor: 1,
        storageEngine: { type: "memory", dataSize: 1073741824 },
      },
    ],
    resources: DEFAULT_RESOURCES,
    monitoring: undefined as MonitoringConfig | undefined,
    templateRef: undefined as { name: string } | undefined,
    enableDynamicConfig: false,
    autoConnect: true,
    acl: undefined as ACLConfig | undefined,
    rollingUpdate: undefined as RollingUpdateConfig | undefined,
    rackConfig: { racks: [] },
  });

  const [nodes, setNodes] = useState<K8sNodeInfo[]>([]);

  useEffect(() => {
    setFetchingOptions(true);
    const errors: string[] = [];
    Promise.allSettled([
      api
        .getK8sNamespaces()
        .then((ns) => {
          setK8sNamespaces(ns);
          if (ns.length > 0) {
            const preferred = ns.includes("default") ? "default" : ns[0];
            setForm((prev) => ({ ...prev, namespace: preferred }));
          }
        })
        .catch((err) => {
          errors.push(`Failed to fetch K8s namespaces: ${getErrorMessage(err)}`);
        }),
      api
        .getK8sStorageClasses()
        .then((sc) => setStorageClasses(sc))
        .catch((err) => {
          errors.push(`Failed to fetch storage classes: ${getErrorMessage(err)}`);
        }),
      fetchTemplates().catch(() => {
        // Templates are optional, silently ignore fetch failures
      }),
    ]).finally(() => {
      setFetchError(errors.length > 0 ? `${errors.join(". ")}. Using defaults.` : null);
      setFetchingOptions(false);
    });
  }, [fetchTemplates]);

  // Fetch K8s secrets when on Advanced step and ACL is enabled (scratch mode only)
  useEffect(() => {
    if (!isTemplateMode && step === 3 && form.acl?.enabled && form.namespace) {
      api
        .getK8sSecrets(form.namespace)
        .then(setK8sSecrets)
        .catch(() => setK8sSecrets([]));
    }
  }, [step, form.acl?.enabled, form.namespace, isTemplateMode]);

  // Fetch K8s nodes when on Advanced step (scratch mode only)
  useEffect(() => {
    if (!isTemplateMode && step === 3) {
      api
        .getK8sNodes()
        .then(setNodes)
        .catch((err) => {
          console.error("Failed to fetch K8s nodes:", err);
          useToastStore
            .getState()
            .addToast("error", "Failed to load node information for zone selection");
        });
    }
  }, [step, isTemplateMode]);

  const updateForm = (updates: Partial<CreateK8sClusterRequest>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handleTemplateSelect = async (name: string) => {
    setSelectedTemplateName(name);
    setTemplateLoading(true);
    try {
      const detail = await api.getK8sTemplate(name);
      setTemplateDetail(detail);
      const updates = buildFormUpdatesFromTemplate(detail.spec, name);
      updateForm(updates);
    } catch (err) {
      useToastStore
        .getState()
        .addToast("error", `Failed to load template: ${getErrorMessage(err)}`);
      setSelectedTemplateName(null);
      setTemplateDetail(null);
    } finally {
      setTemplateLoading(false);
    }
  };

  const canProceed = () => {
    // Step 0: Creation Mode (same for both modes)
    if (step === 0) {
      if (creationMode === "scratch") return true;
      return selectedTemplateName !== null && !templateLoading;
    }

    if (isTemplateMode) {
      // Template mode step 1: Name & Namespace only
      if (step === 1) {
        return validateK8sName(form.name) === null && form.namespace.length > 0;
      }
      // Template mode step 2: Namespace & Storage
      if (step === 2) {
        return validateNamespaces(form.namespaces, form.size) === null;
      }
      return true;
    }

    // Scratch mode steps
    // Step 1: Basic & Resources
    if (step === 1) {
      if (validateK8sName(form.name) !== null || form.namespace.length === 0) return false;
      const res = form.resources ?? DEFAULT_RESOURCES;
      if (validateK8sCpu(res.requests.cpu) !== null) return false;
      if (validateK8sCpu(res.limits.cpu) !== null) return false;
      if (validateK8sMemory(res.requests.memory) !== null) return false;
      if (validateK8sMemory(res.limits.memory) !== null) return false;
      if (parseCpuMillis(res.limits.cpu) < parseCpuMillis(res.requests.cpu)) return false;
      if (parseMemoryBytes(res.limits.memory) < parseMemoryBytes(res.requests.memory)) return false;
      return true;
    }
    // Step 2: Namespace & Storage
    if (step === 2) {
      return validateNamespaces(form.namespaces, form.size) === null;
    }
    // Step 3: Advanced — validate ACL if enabled
    if (step === 3) {
      if (form.acl?.enabled) {
        if (form.acl.users.length === 0) return false;
        for (const user of form.acl.users) {
          if (!user.name.trim() || !user.secretName.trim() || user.roles.length === 0) return false;
        }
        for (const role of form.acl.roles) {
          if (!role.name.trim() || role.privileges.length === 0) return false;
        }
      }
      return true;
    }
    return true;
  };

  const handleCreate = async () => {
    setCreationError(null);
    setCreating(true);
    try {
      const payload = { ...form };
      if (payload.rollingUpdate) {
        const ru = payload.rollingUpdate;
        if (ru.batchSize == null && !ru.maxUnavailable && !ru.disablePDB) {
          payload.rollingUpdate = undefined;
        }
      }
      if (
        payload.networkPolicy &&
        payload.networkPolicy.accessType === "pod" &&
        !payload.networkPolicy.alternateAccessType &&
        !payload.networkPolicy.fabricType
      ) {
        payload.networkPolicy = undefined;
      }
      if (payload.rackConfig && payload.rackConfig.racks.length > 0) {
        payload.rackConfig = {
          ...payload.rackConfig,
          racks: payload.rackConfig.racks.map((r) => ({
            id: r.id,
            ...(r.zone ? { zone: r.zone } : {}),
            ...(r.region ? { region: r.region } : {}),
            ...(r.rackLabel ? { rackLabel: r.rackLabel } : {}),
            ...(r.aerospikeConfig ? { aerospikeConfig: r.aerospikeConfig } : {}),
            ...(r.storage?.volumes?.length ? { storage: r.storage } : {}),
            ...(r.podSpec?.nodeSelector || r.podSpec?.tolerations?.length || r.podSpec?.affinity
              ? { podSpec: r.podSpec }
              : {}),
          })),
        } as typeof payload.rackConfig;
      } else {
        payload.rackConfig = undefined;
      }
      // Clean up empty service metadata
      if (
        payload.headlessService &&
        !payload.headlessService.annotations &&
        !payload.headlessService.labels
      ) {
        payload.headlessService = undefined;
      }
      if (payload.podService && !payload.podService.annotations && !payload.podService.labels) {
        payload.podService = undefined;
      }
      // Clean up empty podScheduling
      if (payload.podScheduling) {
        const ps = payload.podScheduling;
        const hasValues =
          ps.readinessGateEnabled ||
          ps.podManagementPolicy ||
          ps.dnsPolicy ||
          ps.metadata?.labels ||
          ps.metadata?.annotations ||
          ps.nodeSelector ||
          ps.tolerations?.length ||
          ps.multiPodPerHost ||
          ps.hostNetwork ||
          ps.serviceAccountName ||
          ps.terminationGracePeriodSeconds != null ||
          ps.imagePullSecrets?.length;
        if (!hasValues) {
          payload.podScheduling = undefined;
        }
      }
      // Clean up empty validationPolicy
      if (payload.validationPolicy && !payload.validationPolicy.skipWorkDirValidate) {
        payload.validationPolicy = undefined;
      }
      await createCluster(payload);
      useToastStore.getState().addToast("success", `Cluster "${form.name}" creation initiated`);
      router.push("/k8s/clusters");
    } catch (err) {
      const msg = getErrorMessage(err);
      setCreationError(msg);
      useToastStore.getState().addToast("error", "Failed to create cluster");
    } finally {
      setCreating(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(0)} GiB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MiB`;
    return `${bytes} bytes`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <InlineAlert message={fetchError} variant="warning" />
      <InlineAlert message={creationError} variant="error" />

      {/* Step indicator */}
      <nav aria-label="Wizard steps" className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-base-content/60 text-sm font-medium">
            Step {step + 1} of {STEPS.length}
            <span className="text-base-content/60/60 mx-1.5">—</span>
            <span className="text-base-content">{STEPS[step]}</span>
          </p>
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1" />
        <div className="flex items-center gap-2" role="tablist">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}: ${label}`}
              aria-current={i === step ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  i === step
                    ? "bg-accent text-accent-foreground"
                    : i < step
                      ? "bg-accent/20 text-accent"
                      : "bg-base-200 text-base-content/60"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`hidden text-sm sm:inline ${
                  i === step ? "text-base-content font-medium" : "text-base-content/60"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <span className="bg-border mx-1 h-px w-4 sm:w-8" />}
            </button>
          ))}
        </div>
      </nav>

      {fetchingOptions && (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="border-accent h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="text-base-content/60 text-sm">Loading K8s options...</span>
        </div>
      )}

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <WizardCreationModeStep
              form={form}
              updateForm={updateForm}
              templates={templates}
              creationMode={creationMode}
              setCreationMode={setCreationMode}
              selectedTemplateName={selectedTemplateName}
              onTemplateSelect={handleTemplateSelect}
              templateDetail={templateDetail}
              templateLoading={templateLoading}
            />
          )}

          {step === 1 && isTemplateMode && (
            <WizardTemplateNameStep
              form={form}
              updateForm={updateForm}
              k8sNamespaces={k8sNamespaces}
              fetchingOptions={fetchingOptions}
            />
          )}

          {step === 1 && !isTemplateMode && (
            <WizardBasicStep
              form={form}
              updateForm={updateForm}
              k8sNamespaces={k8sNamespaces}
              fetchingOptions={fetchingOptions}
              defaultResources={DEFAULT_RESOURCES}
            />
          )}

          {step === 2 && (
            <WizardNamespaceStorageStep
              form={form}
              updateForm={updateForm}
              storageClasses={storageClasses}
              defaultStorage={DEFAULT_STORAGE}
            />
          )}

          {step === 3 && !isTemplateMode && (
            <WizardAdvancedStep
              form={form}
              updateForm={updateForm}
              k8sSecrets={k8sSecrets}
              nodes={nodes}
            />
          )}

          {step === STEPS.length - 1 && (
            <WizardReviewStep
              form={form}
              updateForm={updateForm}
              formatBytes={formatBytes}
              isTemplateMode={isTemplateMode}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
          disabled={creating}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
            Next
          </Button>
        ) : (
          <LoadingButton onClick={handleCreate} loading={creating} disabled={creating}>
            Create Cluster
          </LoadingButton>
        )}
      </div>
    </div>
  );
}

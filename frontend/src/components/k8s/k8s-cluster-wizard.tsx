"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  MAX_CE_NAMESPACES,
  parseCpuMillis,
  parseMemoryBytes,
} from "@/lib/validations/k8s";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  AerospikeNamespaceConfig,
  CreateK8sClusterRequest,
  MonitoringConfig,
  ACLConfig,
  ACLRoleSpec,
  ACLUserSpec,
  RollingUpdateConfig,
  RackAwareConfig,
  TemplateOverrides,
  K8sNodeInfo,
} from "@/lib/api/types";

const AEROSPIKE_IMAGES = ["aerospike:ce-8.1.1.1", "aerospike:ce-7.2.0.6"];

const STEPS = [
  "Basic",
  "Namespace & Storage",
  "Monitoring & Options",
  "Resources",
  "Security (ACL)",
  "Rolling Update",
  "Rack Config",
  "Review",
];

const AEROSPIKE_PRIVILEGES = [
  "read",
  "read-write",
  "read-write-udf",
  "sys-admin",
  "data-admin",
  "user-admin",
];

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
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [templateOverrides, setTemplateOverrides] = useState<TemplateOverrides>({});

  const DEFAULT_RESOURCES = {
    requests: { cpu: "500m", memory: "1Gi" },
    limits: { cpu: "2", memory: "4Gi" },
  };

  const [form, setForm] = useState<CreateK8sClusterRequest>({
    name: "",
    namespace: "aerospike",
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
    templateRef: undefined as string | undefined,
    enableDynamicConfig: false,
    autoConnect: true,
    acl: undefined as ACLConfig | undefined,
    rollingUpdate: undefined as RollingUpdateConfig | undefined,
    rackConfig: { racks: [] },
  });

  const [nodes, setNodes] = useState<K8sNodeInfo[]>([]);

  useEffect(() => {
    setFetchingOptions(true);
    Promise.allSettled([
      api
        .getK8sNamespaces()
        .then((ns) => {
          setK8sNamespaces(ns);
          setFetchError(null);
        })
        .catch((err) => {
          setFetchError(`Failed to fetch K8s namespaces: ${getErrorMessage(err)}. Using defaults.`);
        }),
      api
        .getK8sStorageClasses()
        .then((sc) => {
          setStorageClasses(sc);
          setFetchError(null);
        })
        .catch((err) => {
          setFetchError(
            `Failed to fetch storage classes: ${getErrorMessage(err)}. Using defaults.`,
          );
        }),
      fetchTemplates().catch(() => {
        // Templates are optional, silently ignore fetch failures
      }),
    ]).finally(() => {
      setFetchingOptions(false);
    });
  }, [fetchTemplates]);

  // Fetch K8s secrets when on the ACL step and namespace is available
  useEffect(() => {
    if (step === 4 && form.acl?.enabled && form.namespace) {
      api
        .getK8sSecrets(form.namespace)
        .then(setK8sSecrets)
        .catch(() => setK8sSecrets([]));
    }
  }, [step, form.acl?.enabled, form.namespace]);

  // Fetch K8s nodes when on the Rack Config step
  useEffect(() => {
    if (step === 6) {
      api
        .getK8sNodes()
        .then(setNodes)
        .catch((err) => {
          console.error("Failed to fetch K8s nodes:", err);
          toast.error("Failed to load node information for zone selection");
        });
    }
  }, [step]);

  const updateForm = (updates: Partial<CreateK8sClusterRequest>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const updateResource = (
    section: "requests" | "limits",
    field: "cpu" | "memory",
    value: string,
  ) => {
    const current = form.resources ?? DEFAULT_RESOURCES;
    updateForm({
      resources: {
        ...current,
        [section]: { ...current[section], [field]: value },
      },
    });
  };

  const updateNamespace = (
    index: number,
    updates: Partial<CreateK8sClusterRequest["namespaces"][0]>,
  ) => {
    setForm((prev) => {
      const namespaces = [...prev.namespaces];
      namespaces[index] = { ...namespaces[index], ...updates };
      return { ...prev, namespaces };
    });
  };

  const isStoragePersistent = form.namespaces.some((ns) => ns.storageEngine.type === "device");

  const addNamespace = () => {
    if (form.namespaces.length >= MAX_CE_NAMESPACES) return;
    const newNs: AerospikeNamespaceConfig = {
      name: "",
      replicationFactor: Math.min(2, form.size),
      storageEngine: { type: "memory", dataSize: 1073741824 },
    };
    setForm((prev) => ({ ...prev, namespaces: [...prev.namespaces, newNs] }));
  };

  const removeNamespace = (index: number) => {
    if (form.namespaces.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      namespaces: prev.namespaces.filter((_, i) => i !== index),
    }));
  };

  const canProceed = () => {
    if (step === 0) {
      return validateK8sName(form.name) === null;
    }
    if (step === 1) {
      return validateNamespaces(form.namespaces, form.size) === null;
    }
    if (step === 2) {
      // Monitoring & Options step - always valid (all fields optional)
      return true;
    }
    if (step === 3) {
      const res = form.resources ?? DEFAULT_RESOURCES;
      if (validateK8sCpu(res.requests.cpu) !== null) return false;
      if (validateK8sCpu(res.limits.cpu) !== null) return false;
      if (validateK8sMemory(res.requests.memory) !== null) return false;
      if (validateK8sMemory(res.limits.memory) !== null) return false;
      // Cross-field: limits must be >= requests
      if (parseCpuMillis(res.limits.cpu) < parseCpuMillis(res.requests.cpu)) return false;
      if (parseMemoryBytes(res.limits.memory) < parseMemoryBytes(res.requests.memory)) return false;
      return true;
    }
    if (step === 4) {
      // ACL step: if enabled, must have at least one user with admin role
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
    if (step === 5) {
      // Rolling Update step - always valid (all fields optional)
      return true;
    }
    if (step === 6) {
      // Rack Config step - always valid (racks are optional)
      return true;
    }
    return true;
  };

  const handleCreate = async () => {
    setCreationError(null);
    setCreating(true);
    try {
      // Only include rollingUpdate if the user actually set non-default values
      const payload = { ...form };
      if (payload.rollingUpdate) {
        const ru = payload.rollingUpdate;
        if (ru.batchSize == null && !ru.maxUnavailable && !ru.disablePDB) {
          payload.rollingUpdate = undefined;
        }
      }
      // Include rackConfig only if racks are configured
      if (payload.rackConfig && payload.rackConfig.racks.length > 0) {
        payload.rackConfig = {
          racks: payload.rackConfig.racks.map((r) => ({
            id: r.id,
            ...(r.zone ? { zone: r.zone } : {}),
            ...(r.region ? { region: r.region } : {}),
            ...(r.maxPodsPerNode != null ? { maxPodsPerNode: r.maxPodsPerNode } : {}),
          })),
        } as typeof payload.rackConfig;
      } else {
        payload.rackConfig = undefined;
      }
      await createCluster(payload);
      toast.success(`Cluster "${form.name}" creation initiated`);
      router.push("/k8s/clusters");
    } catch (err) {
      const msg = getErrorMessage(err);
      setCreationError(msg);
      toast.error("Failed to create cluster");
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
      <nav aria-label="Wizard steps">
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
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`hidden text-sm sm:inline ${
                  i === step ? "text-foreground font-medium" : "text-muted-foreground"
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
          <span className="text-muted-foreground text-sm">Loading K8s options...</span>
        </div>
      )}

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="cluster-name">Cluster Name</Label>
                <Input
                  id="cluster-name"
                  placeholder="my-aerospike"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value.toLowerCase() })}
                />
                {form.name.length > 0 && validateK8sName(form.name) ? (
                  <p className="text-destructive text-xs">{validateK8sName(form.name)}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Lowercase letters, numbers, and hyphens only (K8s DNS name).
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="k8s-namespace">Namespace</Label>
                <Select value={form.namespace} onValueChange={(v) => updateForm({ namespace: v })}>
                  <SelectTrigger id="k8s-namespace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {k8sNamespaces.length > 0 ? (
                      k8sNamespaces.map((ns) => (
                        <SelectItem key={ns} value={ns}>
                          {ns}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="aerospike">aerospike</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cluster-size">Cluster Size (1-8 nodes)</Label>
                <Input
                  id="cluster-size"
                  type="number"
                  min={1}
                  max={8}
                  value={form.size}
                  onChange={(e) =>
                    updateForm({
                      size: Math.min(8, Math.max(1, parseInt(e.target.value) || 1)),
                    })
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label>Aerospike Image</Label>
                <Select value={form.image} onValueChange={(v) => updateForm({ image: v })}>
                  <SelectTrigger>
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
            </>
          )}

          {step === 1 && (
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
                        const base = form.storage ?? {
                          storageClass: "standard",
                          size: "10Gi",
                          mountPath: "/opt/aerospike/data",
                        };
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
                        const base = form.storage ?? {
                          storageClass: "standard",
                          size: "10Gi",
                          mountPath: "/opt/aerospike/data",
                        };
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
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="monitoring-enabled"
                  checked={form.monitoring?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      updateForm({ monitoring: { enabled: true, port: 9145 } });
                    } else {
                      updateForm({ monitoring: undefined });
                    }
                  }}
                />
                <Label htmlFor="monitoring-enabled" className="text-sm font-normal">
                  Enable Prometheus monitoring
                </Label>
              </div>

              {form.monitoring?.enabled && (
                <div className="grid gap-2">
                  <Label htmlFor="monitoring-port">Exporter Port</Label>
                  <Input
                    id="monitoring-port"
                    type="number"
                    min={1024}
                    max={65535}
                    value={form.monitoring.port}
                    onChange={(e) =>
                      updateForm({
                        monitoring: {
                          enabled: true,
                          port: Math.min(65535, Math.max(1024, parseInt(e.target.value) || 9145)),
                        },
                      })
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    Port for the Aerospike Prometheus exporter sidecar (default: 9145).
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="template-ref">Cluster Template (optional)</Label>
                <Select
                  value={form.templateRef || "__none__"}
                  onValueChange={(v) => {
                    const selected = v === "__none__" ? undefined : v;
                    updateForm({ templateRef: selected, templateOverrides: undefined });
                    if (!selected) {
                      setTemplateOverrides({});
                      setOverridesOpen(false);
                    }
                  }}
                >
                  <SelectTrigger id="template-ref">
                    <SelectValue placeholder="No template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No template</SelectItem>
                    {templates
                      .filter((t) => t.namespace === form.namespace)
                      .map((t) => (
                        <SelectItem key={`${t.namespace}/${t.name}`} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Apply default settings from an AerospikeClusterTemplate resource.
                </p>
              </div>

              {form.templateRef && (
                <div className="rounded-lg border p-3">
                  <button
                    type="button"
                    className="text-foreground flex w-full items-center gap-2 text-sm font-medium"
                    onClick={() => setOverridesOpen(!overridesOpen)}
                  >
                    {overridesOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Template Overrides
                    {(templateOverrides.image ||
                      templateOverrides.size != null ||
                      templateOverrides.resources) && (
                      <span className="bg-accent/20 text-accent rounded-full px-2 py-0.5 text-[10px]">
                        Active
                      </span>
                    )}
                  </button>
                  {overridesOpen && (
                    <div className="mt-3 space-y-3">
                      <p className="text-muted-foreground text-xs">
                        Override specific fields from the template. These values take precedence
                        over the template defaults.
                      </p>
                      <div className="grid gap-2">
                        <Label htmlFor="override-image" className="text-xs">
                          Image Override
                        </Label>
                        <Select
                          value={templateOverrides.image || "__default__"}
                          onValueChange={(v) => {
                            const updated = {
                              ...templateOverrides,
                              image: v === "__default__" ? undefined : v,
                            };
                            setTemplateOverrides(updated);
                            updateForm({
                              templateOverrides:
                                updated.image || updated.size != null || updated.resources
                                  ? updated
                                  : undefined,
                            });
                          }}
                        >
                          <SelectTrigger id="override-image">
                            <SelectValue placeholder="Use template default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__default__">Use template default</SelectItem>
                            {AEROSPIKE_IMAGES.map((img) => (
                              <SelectItem key={img} value={img}>
                                {img}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="override-size" className="text-xs">
                          Size Override (1-8 nodes)
                        </Label>
                        <Input
                          id="override-size"
                          type="number"
                          min={1}
                          max={8}
                          placeholder="Use template default"
                          value={templateOverrides.size ?? ""}
                          onChange={(e) => {
                            const val = e.target.value
                              ? Math.min(8, Math.max(1, parseInt(e.target.value) || 1))
                              : undefined;
                            const updated = { ...templateOverrides, size: val };
                            setTemplateOverrides(updated);
                            updateForm({
                              templateOverrides:
                                updated.image || updated.size != null || updated.resources
                                  ? updated
                                  : undefined,
                            });
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs">Resource Overrides</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label
                              htmlFor="override-cpu-req"
                              className="text-muted-foreground text-[10px]"
                            >
                              CPU Request
                            </Label>
                            <Input
                              id="override-cpu-req"
                              placeholder="e.g. 500m"
                              value={templateOverrides.resources?.requests?.cpu ?? ""}
                              onChange={(e) => {
                                const val = e.target.value || undefined;
                                const currentRes = templateOverrides.resources ?? {
                                  requests: { cpu: "", memory: "" },
                                  limits: { cpu: "", memory: "" },
                                };
                                const newRes = {
                                  requests: { ...currentRes.requests, cpu: val ?? "" },
                                  limits: { ...currentRes.limits },
                                };
                                const hasValues =
                                  newRes.requests.cpu ||
                                  newRes.requests.memory ||
                                  newRes.limits.cpu ||
                                  newRes.limits.memory;
                                const updated = {
                                  ...templateOverrides,
                                  resources: hasValues ? newRes : undefined,
                                };
                                setTemplateOverrides(updated);
                                updateForm({
                                  templateOverrides:
                                    updated.image || updated.size != null || updated.resources
                                      ? updated
                                      : undefined,
                                });
                              }}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label
                              htmlFor="override-cpu-lim"
                              className="text-muted-foreground text-[10px]"
                            >
                              CPU Limit
                            </Label>
                            <Input
                              id="override-cpu-lim"
                              placeholder="e.g. 2"
                              value={templateOverrides.resources?.limits?.cpu ?? ""}
                              onChange={(e) => {
                                const val = e.target.value || undefined;
                                const currentRes = templateOverrides.resources ?? {
                                  requests: { cpu: "", memory: "" },
                                  limits: { cpu: "", memory: "" },
                                };
                                const newRes = {
                                  requests: { ...currentRes.requests },
                                  limits: { ...currentRes.limits, cpu: val ?? "" },
                                };
                                const hasValues =
                                  newRes.requests.cpu ||
                                  newRes.requests.memory ||
                                  newRes.limits.cpu ||
                                  newRes.limits.memory;
                                const updated = {
                                  ...templateOverrides,
                                  resources: hasValues ? newRes : undefined,
                                };
                                setTemplateOverrides(updated);
                                updateForm({
                                  templateOverrides:
                                    updated.image || updated.size != null || updated.resources
                                      ? updated
                                      : undefined,
                                });
                              }}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label
                              htmlFor="override-mem-req"
                              className="text-muted-foreground text-[10px]"
                            >
                              Memory Request
                            </Label>
                            <Input
                              id="override-mem-req"
                              placeholder="e.g. 1Gi"
                              value={templateOverrides.resources?.requests?.memory ?? ""}
                              onChange={(e) => {
                                const val = e.target.value || undefined;
                                const currentRes = templateOverrides.resources ?? {
                                  requests: { cpu: "", memory: "" },
                                  limits: { cpu: "", memory: "" },
                                };
                                const newRes = {
                                  requests: { ...currentRes.requests, memory: val ?? "" },
                                  limits: { ...currentRes.limits },
                                };
                                const hasValues =
                                  newRes.requests.cpu ||
                                  newRes.requests.memory ||
                                  newRes.limits.cpu ||
                                  newRes.limits.memory;
                                const updated = {
                                  ...templateOverrides,
                                  resources: hasValues ? newRes : undefined,
                                };
                                setTemplateOverrides(updated);
                                updateForm({
                                  templateOverrides:
                                    updated.image || updated.size != null || updated.resources
                                      ? updated
                                      : undefined,
                                });
                              }}
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label
                              htmlFor="override-mem-lim"
                              className="text-muted-foreground text-[10px]"
                            >
                              Memory Limit
                            </Label>
                            <Input
                              id="override-mem-lim"
                              placeholder="e.g. 4Gi"
                              value={templateOverrides.resources?.limits?.memory ?? ""}
                              onChange={(e) => {
                                const val = e.target.value || undefined;
                                const currentRes = templateOverrides.resources ?? {
                                  requests: { cpu: "", memory: "" },
                                  limits: { cpu: "", memory: "" },
                                };
                                const newRes = {
                                  requests: { ...currentRes.requests },
                                  limits: { ...currentRes.limits, memory: val ?? "" },
                                };
                                const hasValues =
                                  newRes.requests.cpu ||
                                  newRes.requests.memory ||
                                  newRes.limits.cpu ||
                                  newRes.limits.memory;
                                const updated = {
                                  ...templateOverrides,
                                  resources: hasValues ? newRes : undefined,
                                };
                                setTemplateOverrides(updated);
                                updateForm({
                                  templateOverrides:
                                    updated.image || updated.size != null || updated.resources
                                      ? updated
                                      : undefined,
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dynamic-config"
                  checked={form.enableDynamicConfig ?? false}
                  onCheckedChange={(checked) =>
                    updateForm({ enableDynamicConfig: checked === true })
                  }
                />
                <Label htmlFor="dynamic-config" className="text-sm font-normal">
                  Enable dynamic config (apply config changes without restart)
                </Label>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cpu-request">CPU Request</Label>
                  <Input
                    id="cpu-request"
                    value={form.resources?.requests.cpu || "500m"}
                    onChange={(e) => updateResource("requests", "cpu", e.target.value)}
                  />
                  {validateK8sCpu(form.resources?.requests.cpu || "500m") && (
                    <p className="text-destructive text-xs">
                      {validateK8sCpu(form.resources?.requests.cpu || "500m")}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cpu-limit">CPU Limit</Label>
                  <Input
                    id="cpu-limit"
                    value={form.resources?.limits.cpu || "2"}
                    onChange={(e) => updateResource("limits", "cpu", e.target.value)}
                  />
                  {validateK8sCpu(form.resources?.limits.cpu || "2") && (
                    <p className="text-destructive text-xs">
                      {validateK8sCpu(form.resources?.limits.cpu || "2")}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="mem-request">Memory Request</Label>
                  <Input
                    id="mem-request"
                    value={form.resources?.requests.memory || "1Gi"}
                    onChange={(e) => updateResource("requests", "memory", e.target.value)}
                  />
                  {validateK8sMemory(form.resources?.requests.memory || "1Gi") && (
                    <p className="text-destructive text-xs">
                      {validateK8sMemory(form.resources?.requests.memory || "1Gi")}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mem-limit">Memory Limit</Label>
                  <Input
                    id="mem-limit"
                    value={form.resources?.limits.memory || "4Gi"}
                    onChange={(e) => updateResource("limits", "memory", e.target.value)}
                  />
                  {validateK8sMemory(form.resources?.limits.memory || "4Gi") && (
                    <p className="text-destructive text-xs">
                      {validateK8sMemory(form.resources?.limits.memory || "4Gi")}
                    </p>
                  )}
                </div>
              </div>

              {(() => {
                const res = form.resources ?? DEFAULT_RESOURCES;
                const cpuValid =
                  !validateK8sCpu(res.requests.cpu) && !validateK8sCpu(res.limits.cpu);
                const memValid =
                  !validateK8sMemory(res.requests.memory) && !validateK8sMemory(res.limits.memory);
                return (
                  <>
                    {cpuValid &&
                      parseCpuMillis(res.limits.cpu) < parseCpuMillis(res.requests.cpu) && (
                        <p className="text-destructive text-xs">CPU limit must be &gt;= request</p>
                      )}
                    {memValid &&
                      parseMemoryBytes(res.limits.memory) <
                        parseMemoryBytes(res.requests.memory) && (
                        <p className="text-destructive text-xs">
                          Memory limit must be &gt;= request
                        </p>
                      )}
                  </>
                );
              })()}

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="auto-connect"
                  checked={form.autoConnect}
                  onCheckedChange={(checked) => updateForm({ autoConnect: checked === true })}
                />
                <Label htmlFor="auto-connect" className="text-sm font-normal">
                  Auto-connect after creation
                </Label>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="acl-enabled"
                  checked={form.acl?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      updateForm({
                        acl: {
                          enabled: true,
                          roles: [],
                          users: [],
                          adminPolicyTimeout: 2000,
                        },
                      });
                    } else {
                      updateForm({ acl: undefined });
                    }
                  }}
                />
                <Label htmlFor="acl-enabled" className="text-sm font-normal">
                  Enable ACL (Access Control)
                </Label>
              </div>

              {form.acl?.enabled && (
                <div className="space-y-6 pt-2">
                  <div className="grid gap-2">
                    <Label htmlFor="admin-timeout">Admin Policy Timeout (ms)</Label>
                    <Input
                      id="admin-timeout"
                      type="number"
                      min={100}
                      max={30000}
                      value={form.acl.adminPolicyTimeout}
                      onChange={(e) =>
                        updateForm({
                          acl: {
                            ...form.acl!,
                            adminPolicyTimeout: parseInt(e.target.value) || 2000,
                          },
                        })
                      }
                    />
                  </div>

                  {/* Roles Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Roles</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateForm({
                            acl: {
                              ...form.acl!,
                              roles: [
                                ...form.acl!.roles,
                                { name: "", privileges: [], whitelist: [] },
                              ],
                            },
                          })
                        }
                      >
                        Add Role
                      </Button>
                    </div>
                    {form.acl.roles.map((role, ri) => (
                      <div
                        key={`role-${ri}-${role.name || ri}`}
                        className="space-y-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Role name"
                            value={role.name}
                            onChange={(e) => {
                              const roles = [...form.acl!.roles];
                              roles[ri] = { ...roles[ri], name: e.target.value };
                              updateForm({ acl: { ...form.acl!, roles } });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const roles = form.acl!.roles.filter((_, i) => i !== ri);
                              updateForm({ acl: { ...form.acl!, roles } });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-muted-foreground text-xs">Privileges</Label>
                          <div className="flex flex-wrap gap-2">
                            {AEROSPIKE_PRIVILEGES.map((priv) => (
                              <label key={priv} className="flex items-center gap-1 text-xs">
                                <Checkbox
                                  checked={role.privileges.includes(priv)}
                                  onCheckedChange={(checked) => {
                                    const roles = [...form.acl!.roles];
                                    const privileges = checked
                                      ? [...roles[ri].privileges, priv]
                                      : roles[ri].privileges.filter((p) => p !== priv);
                                    roles[ri] = { ...roles[ri], privileges };
                                    updateForm({ acl: { ...form.acl!, roles } });
                                  }}
                                />
                                {priv}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-muted-foreground text-xs">
                            Whitelist CIDRs (comma-separated, optional)
                          </Label>
                          <Input
                            placeholder="e.g. 10.0.0.0/8, 192.168.1.0/24"
                            value={role.whitelist?.join(", ") ?? ""}
                            onChange={(e) => {
                              const roles = [...form.acl!.roles];
                              const raw = e.target.value;
                              roles[ri] = {
                                ...roles[ri],
                                whitelist: raw
                                  ? raw
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                  : [],
                              };
                              updateForm({ acl: { ...form.acl!, roles } });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Users Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Users</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateForm({
                            acl: {
                              ...form.acl!,
                              users: [...form.acl!.users, { name: "", secretName: "", roles: [] }],
                            },
                          })
                        }
                      >
                        Add User
                      </Button>
                    </div>
                    {form.acl.users.map((user, ui) => (
                      <div
                        key={`user-${ui}-${user.name || ui}`}
                        className="space-y-2 rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Username"
                            value={user.name}
                            onChange={(e) => {
                              const users = [...form.acl!.users];
                              users[ui] = { ...users[ui], name: e.target.value };
                              updateForm({ acl: { ...form.acl!, users } });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const users = form.acl!.users.filter((_, i) => i !== ui);
                              updateForm({ acl: { ...form.acl!, users } });
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-muted-foreground text-xs">
                            K8s Secret Name (password)
                          </Label>
                          {k8sSecrets.length > 0 ? (
                            <Select
                              value={user.secretName || "__none__"}
                              onValueChange={(v) => {
                                const users = [...form.acl!.users];
                                users[ui] = {
                                  ...users[ui],
                                  secretName: v === "__none__" ? "" : v,
                                };
                                updateForm({ acl: { ...form.acl!, users } });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a secret" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Select a secret...</SelectItem>
                                {k8sSecrets.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="my-aerospike-secret"
                              value={user.secretName}
                              onChange={(e) => {
                                const users = [...form.acl!.users];
                                users[ui] = { ...users[ui], secretName: e.target.value };
                                updateForm({ acl: { ...form.acl!, users } });
                              }}
                            />
                          )}
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-muted-foreground text-xs">Roles</Label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              ...AEROSPIKE_PRIVILEGES.map((p) => p),
                              ...form.acl!.roles.map((r) => r.name).filter(Boolean),
                            ]
                              .filter((v, i, a) => a.indexOf(v) === i)
                              .map((roleName) => (
                                <label key={roleName} className="flex items-center gap-1 text-xs">
                                  <Checkbox
                                    checked={user.roles.includes(roleName)}
                                    onCheckedChange={(checked) => {
                                      const users = [...form.acl!.users];
                                      const roles = checked
                                        ? [...users[ui].roles, roleName]
                                        : users[ui].roles.filter((r) => r !== roleName);
                                      users[ui] = { ...users[ui], roles };
                                      updateForm({ acl: { ...form.acl!, users } });
                                    }}
                                  />
                                  {roleName}
                                </label>
                              ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="batch-size">Batch Size (optional)</Label>
                <Input
                  id="batch-size"
                  type="number"
                  min={1}
                  placeholder="e.g. 1"
                  value={form.rollingUpdate?.batchSize ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : undefined;
                    updateForm({
                      rollingUpdate: {
                        batchSize: val,
                        maxUnavailable: form.rollingUpdate?.maxUnavailable,
                        disablePDB: form.rollingUpdate?.disablePDB ?? false,
                      },
                    });
                  }}
                />
                <p className="text-muted-foreground text-xs">
                  Number of pods to update at a time during rolling restarts.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="max-unavailable">Max Unavailable (optional)</Label>
                <Input
                  id="max-unavailable"
                  placeholder='e.g. "1" or "25%"'
                  value={form.rollingUpdate?.maxUnavailable ?? ""}
                  onChange={(e) =>
                    updateForm({
                      rollingUpdate: {
                        batchSize: form.rollingUpdate?.batchSize,
                        maxUnavailable: e.target.value || undefined,
                        disablePDB: form.rollingUpdate?.disablePDB ?? false,
                      },
                    })
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Maximum number or percentage of pods that can be unavailable during update.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="disable-pdb"
                  checked={form.rollingUpdate?.disablePDB ?? false}
                  onCheckedChange={(checked) =>
                    updateForm({
                      rollingUpdate: {
                        batchSize: form.rollingUpdate?.batchSize,
                        maxUnavailable: form.rollingUpdate?.maxUnavailable,
                        disablePDB: checked === true,
                      },
                    })
                  }
                />
                <Label htmlFor="disable-pdb" className="text-sm font-normal">
                  Disable PodDisruptionBudget
                </Label>
              </div>
            </>
          )}

          {step === 6 &&
            (() => {
              const racks = form.rackConfig?.racks ?? [];
              return (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Configure multi-rack deployment for zone-aware pod distribution. Each rack gets
                    its own StatefulSet with optional zone affinity.
                  </p>

                  {racks.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <p className="text-muted-foreground mb-3 text-sm">
                        No racks configured. The cluster will use a single default rack.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateForm({
                            rackConfig: {
                              racks: [{ id: 1, zone: "", region: "" }],
                            },
                          });
                        }}
                      >
                        Enable Multi-Rack
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const uniqueZones = [...new Set(nodes.map((n) => n.zone).filter(Boolean))];
                        return racks.map((rack, idx) => (
                          <div key={idx} className="space-y-3 rounded-lg border p-4">
                            <div className="flex items-center justify-between">
                              <Label className="font-medium">Rack #{rack.id}</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive h-7 px-2"
                                onClick={() => {
                                  const newRacks = racks.filter((_, i) => i !== idx);
                                  updateForm({ rackConfig: { racks: newRacks } });
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="grid gap-1">
                                <Label className="text-xs">Zone</Label>
                                {uniqueZones.length > 0 ? (
                                  <Select
                                    value={rack.zone || ""}
                                    onValueChange={(v) => {
                                      const newRacks = [...racks];
                                      newRacks[idx] = { ...rack, zone: v };
                                      updateForm({ rackConfig: { racks: newRacks } });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select zone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {uniqueZones.map((z) => (
                                        <SelectItem key={z} value={z}>
                                          {z}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={rack.zone || ""}
                                    onChange={(e) => {
                                      const newRacks = [...racks];
                                      newRacks[idx] = { ...rack, zone: e.target.value };
                                      updateForm({ rackConfig: { racks: newRacks } });
                                    }}
                                    placeholder="e.g. us-east-1a"
                                  />
                                )}
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">Max Pods Per Node</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={rack.maxPodsPerNode ?? ""}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    const newRacks = [...racks];
                                    newRacks[idx] = {
                                      ...rack,
                                      maxPodsPerNode: isNaN(val) ? undefined : Math.max(1, val),
                                    };
                                    updateForm({ rackConfig: { racks: newRacks } });
                                  }}
                                  placeholder="No limit"
                                />
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const maxId = Math.max(0, ...racks.map((r) => r.id));
                          updateForm({
                            rackConfig: {
                              racks: [...racks, { id: maxId + 1, zone: "", region: "" }],
                            },
                          });
                        }}
                      >
                        + Add Rack
                      </Button>
                      <p className="text-muted-foreground text-xs">
                        Tip: For {form.size} nodes across {racks.length} racks, approximately{" "}
                        {`${Math.floor(form.size / racks.length)}-${Math.ceil(form.size / racks.length)}`}{" "}
                        pods per rack.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

          {step === 7 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{form.name}</span>

                <span className="text-muted-foreground">Namespace</span>
                <span className="font-medium">{form.namespace}</span>

                <span className="text-muted-foreground">Size</span>
                <span className="font-medium">
                  {form.size} node{form.size !== 1 ? "s" : ""}
                </span>

                <span className="text-muted-foreground">Image</span>
                <span className="font-mono text-xs font-medium">{form.image}</span>

                <span className="text-muted-foreground">Namespaces</span>
                <span className="font-medium">{form.namespaces.length}</span>

                {form.namespaces.map((ns, ni) => (
                  <div
                    key={`review-ns-${ni}`}
                    className="col-span-2 ml-2 rounded border p-2 text-xs"
                  >
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{ns.name}</span>
                      <span className="text-muted-foreground">Storage</span>
                      <span className="font-medium">
                        {ns.storageEngine.type === "device"
                          ? `Persistent (${form.storage?.size || "10Gi"})`
                          : `In-Memory (${formatBytes(ns.storageEngine.dataSize || 1073741824)})`}
                      </span>
                      <span className="text-muted-foreground">Replication</span>
                      <span className="font-medium">{ns.replicationFactor}</span>
                    </div>
                  </div>
                ))}

                {form.resources && (
                  <>
                    <span className="text-muted-foreground">Resources</span>
                    <span className="font-medium">
                      CPU: {form.resources.requests.cpu}/{form.resources.limits.cpu}, Mem:{" "}
                      {form.resources.requests.memory}/{form.resources.limits.memory}
                    </span>
                  </>
                )}

                <span className="text-muted-foreground">Monitoring</span>
                <span className="font-medium">
                  {form.monitoring?.enabled ? `Enabled (port ${form.monitoring.port})` : "Disabled"}
                </span>

                {form.templateRef && (
                  <>
                    <span className="text-muted-foreground">Template</span>
                    <span className="font-medium">{form.templateRef}</span>
                  </>
                )}

                {form.templateRef && form.templateOverrides && (
                  <>
                    <span className="text-muted-foreground">Template Overrides</span>
                    <span className="font-medium">
                      {[
                        form.templateOverrides.image && `Image: ${form.templateOverrides.image}`,
                        form.templateOverrides.size != null &&
                          `Size: ${form.templateOverrides.size}`,
                        form.templateOverrides.resources &&
                          `Resources: CPU ${form.templateOverrides.resources.requests.cpu || "-"}/${form.templateOverrides.resources.limits.cpu || "-"}, Mem ${form.templateOverrides.resources.requests.memory || "-"}/${form.templateOverrides.resources.limits.memory || "-"}`,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </>
                )}

                <span className="text-muted-foreground">Dynamic Config</span>
                <span className="font-medium">
                  {form.enableDynamicConfig ? "Enabled" : "Disabled"}
                </span>

                <span className="text-muted-foreground">ACL</span>
                <span className="font-medium">
                  {form.acl?.enabled
                    ? `Enabled (${form.acl.roles.length} role${form.acl.roles.length !== 1 ? "s" : ""}, ${form.acl.users.length} user${form.acl.users.length !== 1 ? "s" : ""})`
                    : "Disabled"}
                </span>

                {form.acl?.enabled && (
                  <>
                    <span className="text-muted-foreground">ACL Timeout</span>
                    <span className="font-medium">{form.acl.adminPolicyTimeout}ms</span>
                  </>
                )}

                <span className="text-muted-foreground">Rolling Update</span>
                <span className="font-medium">
                  {form.rollingUpdate
                    ? [
                        form.rollingUpdate.batchSize != null &&
                          `batch: ${form.rollingUpdate.batchSize}`,
                        form.rollingUpdate.maxUnavailable &&
                          `maxUnavail: ${form.rollingUpdate.maxUnavailable}`,
                        form.rollingUpdate.disablePDB && "PDB disabled",
                      ]
                        .filter(Boolean)
                        .join(", ") || "Default"
                    : "Default"}
                </span>

                {(form.rackConfig?.racks ?? []).length > 0 && (
                  <>
                    <span className="text-muted-foreground">Racks</span>
                    <div className="space-y-1">
                      {form.rackConfig!.racks.map((rack) => (
                        <span key={rack.id} className="block font-mono text-xs">
                          Rack #{rack.id}
                          {rack.zone ? ` (zone: ${rack.zone})` : ""}
                          {rack.maxPodsPerNode ? ` max: ${rack.maxPodsPerNode}/node` : ""}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                <span className="text-muted-foreground">Auto-connect</span>
                <span className="font-medium">{form.autoConnect ? "Yes" : "No"}</span>
              </div>
            </div>
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

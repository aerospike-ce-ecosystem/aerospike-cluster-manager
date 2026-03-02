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
  parseCpuMillis,
  parseMemoryBytes,
} from "@/lib/validations/k8s";
import { toast } from "sonner";
import type { CreateK8sClusterRequest, MonitoringConfig } from "@/lib/api/types";

const AEROSPIKE_IMAGES = ["aerospike:ce-8.1.1.1", "aerospike:ce-7.2.0.6"];

const STEPS = ["Basic", "Namespace & Storage", "Monitoring & Options", "Resources", "Review"];

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
  });

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

  const isStoragePersistent = form.namespaces[0]?.storageEngine.type === "device";

  const canProceed = () => {
    if (step === 0) {
      return validateK8sName(form.name) === null;
    }
    if (step === 1) {
      const ns = form.namespaces[0];
      if (!ns || !ns.name || ns.name.trim().length === 0) return false;
      if (ns.replicationFactor > form.size) return false;
      return true;
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
    return true;
  };

  const handleCreate = async () => {
    setCreationError(null);
    setCreating(true);
    try {
      await createCluster(form);
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
              <div className="grid gap-2">
                <Label htmlFor="ns-name">Aerospike Namespace Name</Label>
                <Input
                  id="ns-name"
                  value={form.namespaces[0]?.name || "test"}
                  onChange={(e) => updateNamespace(0, { name: e.target.value })}
                />
                {form.namespaces[0]?.name !== undefined &&
                  form.namespaces[0].name.trim().length === 0 && (
                    <p className="text-destructive text-xs">Namespace name is required</p>
                  )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="storage-type">Storage Type</Label>
                <div
                  id="storage-type"
                  className="flex gap-2"
                  role="group"
                  aria-label="Storage type"
                >
                  <Button
                    type="button"
                    variant={!isStoragePersistent ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      updateNamespace(0, {
                        storageEngine: { type: "memory", dataSize: 1073741824 },
                      })
                    }
                  >
                    In-Memory
                  </Button>
                  <Button
                    type="button"
                    variant={isStoragePersistent ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      updateNamespace(0, {
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

              {!isStoragePersistent && (
                <div className="grid gap-2">
                  <Label htmlFor="memory-size">Memory Size</Label>
                  <Select
                    value={String(form.namespaces[0]?.storageEngine.dataSize || 1073741824)}
                    onValueChange={(v) =>
                      updateNamespace(0, {
                        storageEngine: { type: "memory", dataSize: parseInt(v) },
                      })
                    }
                  >
                    <SelectTrigger id="memory-size">
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

              {isStoragePersistent && (
                <>
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
                </>
              )}

              <div className="grid gap-2">
                <Label htmlFor="repl-factor">Replication Factor (1 - {form.size})</Label>
                <Input
                  id="repl-factor"
                  type="number"
                  min={1}
                  max={form.size}
                  value={form.namespaces[0]?.replicationFactor || 1}
                  onChange={(e) =>
                    updateNamespace(0, {
                      replicationFactor: Math.min(
                        form.size,
                        Math.max(1, parseInt(e.target.value) || 1),
                      ),
                    })
                  }
                />
                {(form.namespaces[0]?.replicationFactor || 1) > form.size && (
                  <p className="text-destructive text-xs">
                    Replication factor ({form.namespaces[0]?.replicationFactor}) cannot exceed
                    cluster size ({form.size}).
                  </p>
                )}
              </div>
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
                  onValueChange={(v) => updateForm({ templateRef: v === "__none__" ? undefined : v })}
                >
                  <SelectTrigger id="template-ref">
                    <SelectValue placeholder="No template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={`${t.namespace}/${t.name}`} value={`${t.namespace}/${t.name}`}>
                        {t.namespace}/{t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Apply default settings from an AerospikeClusterTemplate resource.
                </p>
              </div>

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

                <span className="text-muted-foreground">Aerospike Namespace</span>
                <span className="font-medium">{form.namespaces[0]?.name}</span>

                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">
                  {isStoragePersistent
                    ? `Persistent (${form.storage?.size || "10Gi"})`
                    : `In-Memory (${formatBytes(form.namespaces[0]?.storageEngine.dataSize || 1073741824)})`}
                </span>

                <span className="text-muted-foreground">Replication</span>
                <span className="font-medium">{form.namespaces[0]?.replicationFactor}</span>

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

                <span className="text-muted-foreground">Dynamic Config</span>
                <span className="font-medium">{form.enableDynamicConfig ? "Enabled" : "Disabled"}</span>

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

"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { AEROSPIKE_IMAGES } from "@/lib/constants";
import { Select } from "@/components/ui/select";
import type { WizardReviewStepProps } from "./types";

type EditingField = string | null;

function EditButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-base-content/60 hover:text-accent ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded transition-colors",
        className,
      )}
      title="Edit"
    >
      <Pencil className="h-3 w-3" />
    </button>
  );
}

function InlineActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <span className="ml-1.5 inline-flex gap-0.5">
      <button
        type="button"
        onClick={onSave}
        className="text-success hover:bg-success/10 inline-flex h-5 w-5 items-center justify-center rounded transition-colors"
        title="Save"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-base-content/60 hover:bg-error/10 hover:text-error inline-flex h-5 w-5 items-center justify-center rounded transition-colors"
        title="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function WizardReviewStep({
  form,
  updateForm,
  formatBytes,
  isTemplateMode = false,
}: WizardReviewStepProps) {
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState("");

  const editable = isTemplateMode && !!updateForm;

  const startEdit = (field: string, value: string) => {
    setEditing(field);
    setDraft(value);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const saveEdit = (field: string) => {
    if (!updateForm) return;
    const val = draft.trim();
    switch (field) {
      case "size": {
        const n = parseInt(val, 10);
        if (n >= 1 && n <= 8) updateForm({ size: n });
        break;
      }
      case "image":
        if (val) updateForm({ image: val });
        break;
      case "cpuReq":
        if (val && form.resources)
          updateForm({
            resources: {
              ...form.resources,
              requests: { ...form.resources.requests, cpu: val },
            },
          });
        break;
      case "cpuLim":
        if (val && form.resources)
          updateForm({
            resources: {
              ...form.resources,
              limits: { ...form.resources.limits, cpu: val },
            },
          });
        break;
      case "memReq":
        if (val && form.resources)
          updateForm({
            resources: {
              ...form.resources,
              requests: { ...form.resources.requests, memory: val },
            },
          });
        break;
      case "memLim":
        if (val && form.resources)
          updateForm({
            resources: {
              ...form.resources,
              limits: { ...form.resources.limits, memory: val },
            },
          });
        break;
      case "monitoringPort":
        if (form.monitoring) {
          const port = parseInt(val, 10);
          if (port > 0) updateForm({ monitoring: { ...form.monitoring, port } });
        }
        break;
      case "storageSize":
        if (val && form.storage) updateForm({ storage: { ...form.storage, size: val } });
        break;
      case "storageClass":
        if (val && form.storage) updateForm({ storage: { ...form.storage, storageClass: val } });
        break;
    }
    cancelEdit();
  };

  const handleKeyDown = (field: string, e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit(field);
    if (e.key === "Escape") cancelEdit();
  };

  const renderEditable = (
    field: string,
    display: React.ReactNode,
    currentValue: string,
    inputType: "text" | "number" = "text",
    inputClassName?: string,
  ) => {
    if (!editable) return <span className="font-medium">{display}</span>;

    if (editing === field) {
      return (
        <span className="inline-flex items-center gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => handleKeyDown(field, e)}
            type={inputType}
            className={cn("h-7 w-24 px-2 text-xs", inputClassName)}
            autoFocus
          />
          <InlineActions onSave={() => saveEdit(field)} onCancel={cancelEdit} />
        </span>
      );
    }

    return (
      <span className="group/edit inline-flex items-center font-medium">
        {display}
        <EditButton
          onClick={() => startEdit(field, currentValue)}
          className="opacity-0 group-hover/edit:opacity-100"
        />
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {editable && (
        <p className="text-base-content/60 text-xs">
          Hover over a value and click <Pencil className="mb-0.5 inline h-3 w-3" /> to override
          template defaults.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <span className="text-base-content/60">Name</span>
        <span className="font-medium">{form.name}</span>

        <span className="text-base-content/60">Namespace</span>
        <span className="font-medium">{form.namespace}</span>

        <span className="text-base-content/60">Size</span>
        {renderEditable(
          "size",
          <>
            {form.size} node{form.size !== 1 ? "s" : ""}
          </>,
          String(form.size),
          "number",
          "w-16",
        )}

        <span className="text-base-content/60">Image</span>
        {editable && editing === "image" ? (
          <span className="inline-flex items-center gap-1">
            <Select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-7 w-48 px-2 text-xs"
            >
              {AEROSPIKE_IMAGES.map((img) => (
                <option key={img} value={img}>
                  {img}
                </option>
              ))}
            </Select>
            <InlineActions onSave={() => saveEdit("image")} onCancel={cancelEdit} />
          </span>
        ) : editable ? (
          <span className="group/edit inline-flex items-center font-mono text-xs font-medium">
            {form.image}
            <EditButton
              onClick={() => startEdit("image", form.image)}
              className="opacity-0 group-hover/edit:opacity-100"
            />
          </span>
        ) : (
          <span className="font-mono text-xs font-medium">{form.image}</span>
        )}

        <span className="text-base-content/60">Namespaces</span>
        <span className="font-medium">{form.namespaces.length}</span>

        {form.namespaces.map((ns, ni) => (
          <div key={`review-ns-${ni}`} className="col-span-2 ml-2 rounded border p-2 text-xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-base-content/60">Name</span>
              <span className="font-medium">{ns.name}</span>
              <span className="text-base-content/60">Storage</span>
              <span className="font-medium">
                {ns.storageEngine.type === "device"
                  ? `Persistent (${
                      form.storage && "volumes" in form.storage
                        ? form.storage.volumes.find((v) => v.source === "persistentVolume")
                            ?.persistentVolume?.size || "10Gi"
                        : (form.storage as { size?: string } | undefined)?.size || "10Gi"
                    })`
                  : `In-Memory (${formatBytes(ns.storageEngine.dataSize || 1073741824)})`}
              </span>
              <span className="text-base-content/60">Replication</span>
              <span className="font-medium">{ns.replicationFactor}</span>
            </div>
          </div>
        ))}

        {form.resources && (
          <>
            <span className="text-base-content/60">Resources</span>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-base-content/60 w-8">CPU:</span>
                {renderEditable(
                  "cpuReq",
                  form.resources.requests.cpu,
                  form.resources.requests.cpu,
                  "text",
                  "w-16",
                )}
                <span className="text-base-content/60 mx-0.5">/</span>
                {renderEditable(
                  "cpuLim",
                  form.resources.limits.cpu,
                  form.resources.limits.cpu,
                  "text",
                  "w-16",
                )}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-base-content/60 w-8">Mem:</span>
                {renderEditable(
                  "memReq",
                  form.resources.requests.memory,
                  form.resources.requests.memory,
                  "text",
                  "w-20",
                )}
                <span className="text-base-content/60 mx-0.5">/</span>
                {renderEditable(
                  "memLim",
                  form.resources.limits.memory,
                  form.resources.limits.memory,
                  "text",
                  "w-20",
                )}
              </div>
            </div>
          </>
        )}

        <span className="text-base-content/60">Monitoring</span>
        {editable ? (
          <span className="inline-flex items-center gap-2 font-medium">
            <Switch
              checked={form.monitoring?.enabled ?? false}
              onCheckedChange={(checked) => {
                updateForm!({
                  monitoring: checked
                    ? { enabled: true, port: form.monitoring?.port ?? 9145 }
                    : { enabled: false, port: form.monitoring?.port ?? 9145 },
                });
              }}
            />
            {form.monitoring?.enabled ? (
              <span className="inline-flex items-center gap-1">
                Enabled (port{" "}
                {editing === "monitoringPort" ? (
                  <>
                    <Input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => handleKeyDown("monitoringPort", e)}
                      type="number"
                      className="h-6 w-16 px-1 text-xs"
                      autoFocus
                    />
                    <InlineActions
                      onSave={() => saveEdit("monitoringPort")}
                      onCancel={cancelEdit}
                    />
                  </>
                ) : (
                  <span className="group/edit inline-flex items-center">
                    {form.monitoring.port}
                    <EditButton
                      onClick={() => startEdit("monitoringPort", String(form.monitoring!.port))}
                      className="opacity-0 group-hover/edit:opacity-100"
                    />
                  </span>
                )}
                )
              </span>
            ) : (
              "Disabled"
            )}
          </span>
        ) : (
          <span className="font-medium">
            {form.monitoring?.enabled ? `Enabled (port ${form.monitoring.port})` : "Disabled"}
          </span>
        )}

        {form.templateRef && (
          <>
            <span className="text-base-content/60">Template</span>
            <span className="font-medium">
              Created from <span className="text-accent">{form.templateRef.name}</span>
            </span>
          </>
        )}

        <span className="text-base-content/60">Dynamic Config</span>
        {editable ? (
          <span className="inline-flex items-center gap-2 font-medium">
            <Switch
              checked={form.enableDynamicConfig ?? false}
              onCheckedChange={(checked) => updateForm!({ enableDynamicConfig: checked })}
            />
            {form.enableDynamicConfig ? "Enabled" : "Disabled"}
          </span>
        ) : (
          <span className="font-medium">{form.enableDynamicConfig ? "Enabled" : "Disabled"}</span>
        )}

        <span className="text-base-content/60">ACL</span>
        <span className="font-medium">
          {form.acl?.enabled
            ? `Enabled (${form.acl.roles.length} role${form.acl.roles.length !== 1 ? "s" : ""}, ${form.acl.users.length} user${form.acl.users.length !== 1 ? "s" : ""})`
            : "Disabled"}
        </span>

        {form.acl?.enabled && (
          <>
            <span className="text-base-content/60">ACL Timeout</span>
            <span className="font-medium">{form.acl.adminPolicyTimeout}ms</span>
          </>
        )}

        <span className="text-base-content/60">Rolling Update</span>
        <span className="font-medium">
          {form.rollingUpdate
            ? [
                form.rollingUpdate.batchSize != null && `batch: ${form.rollingUpdate.batchSize}`,
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
            <span className="text-base-content/60">Racks</span>
            <div className="space-y-1">
              {form.rackConfig!.racks.map((rack) => (
                <div key={rack.id} className="font-mono text-xs">
                  <span className="block">
                    Rack #{rack.id}
                    {rack.zone ? ` (zone: ${rack.zone})` : ""}
                    {rack.rackLabel ? ` label: ${rack.rackLabel}` : ""}
                  </span>
                  {(rack.podSpec?.tolerations ?? []).length > 0 && (
                    <span className="text-base-content/50 block pl-3">
                      {rack.podSpec!.tolerations!.length} toleration
                      {rack.podSpec!.tolerations!.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {rack.podSpec?.affinity && (
                    <span className="text-base-content/50 block pl-3">
                      node affinity configured
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {form.networkPolicy && form.networkPolicy.accessType !== "pod" && (
          <>
            <span className="text-base-content/60">Network Access</span>
            <span className="font-medium">
              {form.networkPolicy.accessType}
              {form.networkPolicy.fabricType ? `, fabric: ${form.networkPolicy.fabricType}` : ""}
            </span>
          </>
        )}

        {(form.k8sNodeBlockList ?? []).length > 0 && (
          <>
            <span className="text-base-content/60">Node Block List</span>
            <span className="font-medium">{form.k8sNodeBlockList!.join(", ")}</span>
          </>
        )}

        {form.podScheduling?.nodeSelector &&
          Object.keys(form.podScheduling.nodeSelector).length > 0 && (
            <>
              <span className="text-base-content/60">Node Selector</span>
              <span className="font-medium">
                {Object.entries(form.podScheduling.nodeSelector)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ")}
              </span>
            </>
          )}

        {(form.podScheduling?.tolerations ?? []).length > 0 && (
          <>
            <span className="text-base-content/60">Tolerations</span>
            <span className="font-medium">
              {form.podScheduling!.tolerations!.length} toleration
              {form.podScheduling!.tolerations!.length !== 1 ? "s" : ""}
            </span>
          </>
        )}

        {form.podScheduling?.multiPodPerHost && (
          <>
            <span className="text-base-content/60">Multi Pod Per Host</span>
            <span className="font-medium">Enabled</span>
          </>
        )}

        {form.podScheduling?.hostNetwork && (
          <>
            <span className="text-base-content/60">Host Network</span>
            <span className="font-medium">Enabled</span>
          </>
        )}

        {form.podScheduling?.serviceAccountName && (
          <>
            <span className="text-base-content/60">Service Account</span>
            <span className="font-medium">{form.podScheduling.serviceAccountName}</span>
          </>
        )}

        {form.podScheduling?.terminationGracePeriodSeconds != null && (
          <>
            <span className="text-base-content/60">Termination Grace Period</span>
            <span className="font-medium">{form.podScheduling.terminationGracePeriodSeconds}s</span>
          </>
        )}

        {(form.podScheduling?.imagePullSecrets ?? []).length > 0 && (
          <>
            <span className="text-base-content/60">Image Pull Secrets</span>
            <span className="font-medium">{form.podScheduling!.imagePullSecrets!.join(", ")}</span>
          </>
        )}

        {form.validationPolicy?.skipWorkDirValidate && (
          <>
            <span className="text-base-content/60">Validation Policy</span>
            <span className="font-medium">Skip WorkDir Validate</span>
          </>
        )}

        {(form.bandwidthConfig?.ingress || form.bandwidthConfig?.egress) && (
          <>
            <span className="text-base-content/60">Bandwidth Limits</span>
            <span className="font-medium">
              {[
                form.bandwidthConfig?.ingress ? `Ingress: ${form.bandwidthConfig.ingress}` : null,
                form.bandwidthConfig?.egress ? `Egress: ${form.bandwidthConfig.egress}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          </>
        )}

        {(form.sidecars ?? []).length > 0 && (
          <>
            <span className="text-muted-foreground">Sidecars</span>
            <div className="space-y-1">
              {form.sidecars!.map((sc, i) => (
                <span key={i} className="block font-mono text-xs">
                  {sc.name} ({sc.image})
                  {(sc.ports ?? []).length > 0 &&
                    ` ports: ${sc.ports!.map((p) => p.containerPort).join(", ")}`}
                </span>
              ))}
            </div>
          </>
        )}

        {(form.initContainers ?? []).length > 0 && (
          <>
            <span className="text-muted-foreground">Init Containers</span>
            <div className="space-y-1">
              {form.initContainers!.map((ic, i) => (
                <span key={i} className="block font-mono text-xs">
                  {ic.name} ({ic.image})
                </span>
              ))}
            </div>
          </>
        )}

        {form.storage && "volumes" in form.storage ? (
          <>
            <span className="text-muted-foreground">Storage</span>
            <div className="col-span-1 space-y-1">
              <span className="font-medium">
                {form.storage.volumes.length} volume{form.storage.volumes.length !== 1 ? "s" : ""}
              </span>
              {form.storage.volumes.map((vol, vi) => (
                <div key={vi} className="ml-2 rounded border p-1.5 text-xs">
                  <span className="font-medium">{vol.name}</span>
                  <span className="text-muted-foreground ml-1">
                    [{vol.source === "persistentVolume" ? "PVC" : vol.source}]
                  </span>
                  {vol.source === "persistentVolume" && vol.persistentVolume && (
                    <span className="text-muted-foreground ml-1">
                      {vol.persistentVolume.size}
                      {vol.persistentVolume.storageClass
                        ? ` (${vol.persistentVolume.storageClass})`
                        : ""}
                    </span>
                  )}
                  {vol.aerospike?.path && (
                    <span className="text-muted-foreground ml-1"> at {vol.aerospike.path}</span>
                  )}
                  {vol.initMethod ? `, init: ${vol.initMethod}` : ""}
                  {vol.wipeMethod ? `, wipe: ${vol.wipeMethod}` : ""}
                  {vol.cascadeDelete ? ", cascade" : ""}
                </div>
              ))}
            </div>
          </>
        ) : form.storage && !("volumes" in form.storage) ? (
          <>
            <span className="text-base-content/60">Storage</span>
            <span className="font-medium">
              {editable ? (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {renderEditable(
                    "storageSize",
                    (form.storage as { size: string }).size,
                    (form.storage as { size: string }).size,
                    "text",
                    "w-16",
                  )}
                  <span className="text-base-content/60">(</span>
                  {renderEditable(
                    "storageClass",
                    (form.storage as { storageClass: string }).storageClass,
                    (form.storage as { storageClass: string }).storageClass,
                    "text",
                    "w-24",
                  )}
                  <span className="text-base-content/60">)</span>
                </span>
              ) : (
                <>
                  {(form.storage as { size: string }).size} (
                  {(form.storage as { storageClass: string }).storageClass})
                </>
              )}
              {(form.storage as { initMethod?: string }).initMethod
                ? `, init: ${(form.storage as { initMethod: string }).initMethod}`
                : ""}
              {(form.storage as { wipeMethod?: string }).wipeMethod
                ? `, wipe: ${(form.storage as { wipeMethod: string }).wipeMethod}`
                : ""}
              {(form.storage as { cascadeDelete?: boolean }).cascadeDelete === false
                ? ", no cascade delete"
                : ""}
            </span>
          </>
        ) : null}

        {form.podService != null && (
          <>
            <span className="text-muted-foreground">Pod Service</span>
            <span className="font-medium">
              Enabled
              {form.podService.annotations
                ? `, ${Object.keys(form.podService.annotations).length} annotation(s)`
                : ""}
              {form.podService.labels
                ? `, ${Object.keys(form.podService.labels).length} label(s)`
                : ""}
            </span>
          </>
        )}

        {(form.headlessService?.annotations || form.headlessService?.labels) && (
          <>
            <span className="text-muted-foreground">Headless Service</span>
            <span className="font-medium">
              {[
                form.headlessService?.annotations
                  ? `${Object.keys(form.headlessService.annotations).length} annotation(s)`
                  : null,
                form.headlessService?.labels
                  ? `${Object.keys(form.headlessService.labels).length} label(s)`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          </>
        )}

        {form.enableRackIDOverride && (
          <>
            <span className="text-muted-foreground">Rack ID Override</span>
            <span className="font-medium">Enabled</span>
          </>
        )}

        {form.seedsFinderServices?.loadBalancer && (
          <>
            <span className="text-base-content/60">Seeds Finder LB</span>
            <span className="font-medium">
              Port {form.seedsFinderServices.loadBalancer.port}
              {" / "}
              {form.seedsFinderServices.loadBalancer.targetPort}
              {form.seedsFinderServices.loadBalancer.externalTrafficPolicy &&
              form.seedsFinderServices.loadBalancer.externalTrafficPolicy !== "Cluster"
                ? ` (${form.seedsFinderServices.loadBalancer.externalTrafficPolicy})`
                : ""}
            </span>
          </>
        )}

        {(form.storage?.localStorageClasses ?? []).length > 0 && (
          <>
            <span className="text-muted-foreground">Local Storage Classes</span>
            <span className="font-medium">{form.storage!.localStorageClasses!.join(", ")}</span>
          </>
        )}

        {form.storage?.deleteLocalStorageOnRestart && (
          <>
            <span className="text-muted-foreground">Delete Local Storage</span>
            <span className="font-medium">On restart</span>
          </>
        )}

        <span className="text-base-content/60">Auto-connect</span>
        {editable ? (
          <span className="inline-flex items-center gap-2 font-medium">
            <Switch
              checked={form.autoConnect}
              onCheckedChange={(checked) => updateForm!({ autoConnect: checked })}
            />
            {form.autoConnect ? "Yes" : "No"}
          </span>
        ) : (
          <span className="font-medium">{form.autoConnect ? "Yes" : "No"}</span>
        )}
      </div>
    </div>
  );
}

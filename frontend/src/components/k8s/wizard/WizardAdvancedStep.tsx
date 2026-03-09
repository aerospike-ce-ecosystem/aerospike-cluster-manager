import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardMonitoringStep } from "./WizardMonitoringStep";
import { WizardAclStep } from "./WizardAclStep";
import { WizardRollingUpdateStep } from "./WizardRollingUpdateStep";
import { WizardRackConfigStep } from "./WizardRackConfigStep";
import type { WizardAdvancedStepProps } from "./types";
import type { PodSchedulingConfig } from "@/lib/api/types";

function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted-foreground ml-2 text-xs">{summary}</span>
        </div>
        {open ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        )}
      </button>
      {open && <div className="space-y-4 border-t px-4 pt-4 pb-4">{children}</div>}
    </div>
  );
}

function WizardPodSettingsStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  const scheduling = form.podScheduling;

  const updateScheduling = (updates: Partial<PodSchedulingConfig>) => {
    updateForm({
      podScheduling: { ...scheduling, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Configure pod-level settings: metadata, readiness gate, management policy, and DNS.
      </p>

      {/* Pod Metadata */}
      <div className="grid gap-3">
        <Label className="text-sm font-semibold">Pod Metadata</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Extra Labels (key=value, ...)</Label>
            <Input
              value={
                scheduling?.metadata?.labels
                  ? Object.entries(scheduling.metadata.labels)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : ""
              }
              onChange={(e) => {
                const entries = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const labels: Record<string, string> = {};
                for (const entry of entries) {
                  const [k, v] = entry.split("=").map((s) => s.trim());
                  if (k && v) labels[k] = v;
                }
                updateScheduling({
                  metadata: {
                    ...scheduling?.metadata,
                    labels: Object.keys(labels).length > 0 ? labels : undefined,
                  },
                });
              }}
              placeholder="e.g. app=aerospike, team=data"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Extra Annotations (key=value, ...)</Label>
            <Input
              value={
                scheduling?.metadata?.annotations
                  ? Object.entries(scheduling.metadata.annotations)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")
                  : ""
              }
              onChange={(e) => {
                const entries = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const annotations: Record<string, string> = {};
                for (const entry of entries) {
                  const eqIdx = entry.indexOf("=");
                  if (eqIdx > 0) {
                    annotations[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
                  }
                }
                updateScheduling({
                  metadata: {
                    ...scheduling?.metadata,
                    annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
                  },
                });
              }}
              placeholder="e.g. prometheus.io/scrape=true"
            />
          </div>
        </div>
      </div>

      {/* Readiness Gate */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="readiness-gate"
          checked={scheduling?.readinessGateEnabled ?? false}
          onCheckedChange={(checked) => {
            updateScheduling({ readinessGateEnabled: checked === true ? true : undefined });
          }}
        />
        <Label htmlFor="readiness-gate" className="cursor-pointer">
          Enable Readiness Gate (acko.io/aerospike-ready)
        </Label>
      </div>
      <p className="text-muted-foreground -mt-2 ml-6 text-[10px]">
        Pods are excluded from Service endpoints until Aerospike joins cluster mesh and finishes
        migrations.
      </p>

      {/* Pod Management Policy & DNS Policy */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <Label className="text-xs">Pod Management Policy</Label>
          <Select
            value={scheduling?.podManagementPolicy || "default"}
            onValueChange={(v) => {
              updateScheduling({
                podManagementPolicy:
                  v === "default" ? undefined : (v as "OrderedReady" | "Parallel"),
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (OrderedReady)</SelectItem>
              <SelectItem value="OrderedReady">OrderedReady</SelectItem>
              <SelectItem value="Parallel">Parallel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">DNS Policy</Label>
          <Select
            value={scheduling?.dnsPolicy || "default"}
            onValueChange={(v) => {
              updateScheduling({ dnsPolicy: v === "default" ? undefined : v });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default (ClusterFirst)</SelectItem>
              <SelectItem value="ClusterFirst">ClusterFirst</SelectItem>
              <SelectItem value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</SelectItem>
              <SelectItem value="Default">Default</SelectItem>
              <SelectItem value="None">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function WizardAdvancedStep({
  form,
  updateForm,
  k8sSecrets,
  nodes,
}: WizardAdvancedStepProps) {
  const monitoringSummary = form.monitoring?.enabled
    ? `Enabled (port ${form.monitoring.port})`
    : "Disabled";

  const aclSummary = form.acl?.enabled
    ? `${form.acl.roles.length} roles, ${form.acl.users.length} users`
    : "Disabled";

  const rollingSummary =
    form.rollingUpdate?.batchSize != null || form.rollingUpdate?.maxUnavailable
      ? "Customized"
      : "Default";

  const rackSummary =
    (form.rackConfig?.racks ?? []).length > 0
      ? `${form.rackConfig!.racks.length} rack(s)`
      : "Single rack";

  const podSettingsSummary =
    [
      form.podScheduling?.readinessGateEnabled ? "Readiness Gate" : null,
      form.podScheduling?.podManagementPolicy ? form.podScheduling.podManagementPolicy : null,
      form.podScheduling?.metadata?.labels ? "Labels" : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Configure optional settings. All sections have sensible defaults — expand only what you
        need.
      </p>

      <CollapsibleSection title="Monitoring & Network" summary={monitoringSummary}>
        <WizardMonitoringStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Security (ACL)" summary={aclSummary}>
        <WizardAclStep form={form} updateForm={updateForm} k8sSecrets={k8sSecrets} />
      </CollapsibleSection>

      <CollapsibleSection title="Rolling Update" summary={rollingSummary}>
        <WizardRollingUpdateStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Rack Config" summary={rackSummary}>
        <WizardRackConfigStep form={form} updateForm={updateForm} nodes={nodes} />
      </CollapsibleSection>

      <CollapsibleSection title="Pod Settings" summary={podSettingsSummary}>
        <WizardPodSettingsStep form={form} updateForm={updateForm} />
      </CollapsibleSection>
    </div>
  );
}

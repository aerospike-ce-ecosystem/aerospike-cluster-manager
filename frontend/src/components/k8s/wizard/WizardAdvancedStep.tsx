import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { WizardMonitoringStep } from "./WizardMonitoringStep";
import { WizardAclStep } from "./WizardAclStep";
import { WizardRollingUpdateStep } from "./WizardRollingUpdateStep";
import { WizardRackConfigStep } from "./WizardRackConfigStep";
import { WizardSidecarsStep } from "./WizardSidecarsStep";
import { WizardPodSettingsStep } from "./advanced/pod-settings";
import { WizardNodeBlockListStep } from "./advanced/node-block-list";
import { WizardValidationPolicyStep } from "./advanced/validation-policy";
import { WizardBandwidthStep } from "./advanced/bandwidth";
import { WizardPodSecurityContextStep } from "./advanced/pod-security-context";
import { WizardServiceMetadataStep } from "./advanced/service-metadata";
import type { WizardAdvancedStepProps } from "./types";

function WizardRackIDOverrideStep({
  form,
  updateForm,
}: {
  form: WizardAdvancedStepProps["form"];
  updateForm: WizardAdvancedStepProps["updateForm"];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="rack-id-override" className="cursor-pointer text-xs">
            Enable Rack ID Override
          </Label>
          <p className="text-muted-foreground text-[10px]">
            Allow rack ID override for existing data migration. When enabled, the operator
            dynamically assigns rack IDs to pods, which is useful when migrating data from an
            existing cluster with different rack configurations.
          </p>
        </div>
        <Switch
          id="rack-id-override"
          checked={form.enableRackIDOverride ?? false}
          onCheckedChange={(checked) => {
            updateForm({ enableRackIDOverride: checked || undefined });
          }}
        />
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
      form.podScheduling?.nodeSelector
        ? `${Object.keys(form.podScheduling.nodeSelector).length} selector(s)`
        : null,
      form.podScheduling?.tolerations?.length
        ? `${form.podScheduling.tolerations.length} toleration(s)`
        : null,
      form.podScheduling?.multiPodPerHost ? "Multi-Pod" : null,
      form.podScheduling?.hostNetwork ? "Host Network" : null,
      form.podScheduling?.serviceAccountName ? "SA" : null,
      form.podScheduling?.imagePullSecrets?.length
        ? `${form.podScheduling.imagePullSecrets.length} pull secret(s)`
        : null,
      form.podScheduling?.topologySpreadConstraints?.length
        ? `${form.podScheduling.topologySpreadConstraints.length} spread constraint(s)`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const sidecarCount = (form.sidecars ?? []).length;
  const initContainerCount = (form.initContainers ?? []).length;
  const sidecarsSummary =
    sidecarCount > 0 || initContainerCount > 0
      ? [
          sidecarCount > 0 ? `${sidecarCount} sidecar(s)` : null,
          initContainerCount > 0 ? `${initContainerCount} init container(s)` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "None";

  const validationPolicySummary = form.validationPolicy?.skipWorkDirValidate
    ? "Skip WorkDir Validate"
    : "Default";

  const nodeBlockListSummary =
    (form.k8sNodeBlockList ?? []).length > 0
      ? `${form.k8sNodeBlockList!.length} node(s) blocked`
      : "None";

  const bandwidthSummary =
    form.bandwidthConfig?.ingress || form.bandwidthConfig?.egress
      ? [
          form.bandwidthConfig.ingress ? `in: ${form.bandwidthConfig.ingress}` : null,
          form.bandwidthConfig.egress ? `out: ${form.bandwidthConfig.egress}` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "No limits";

  const securityContextSummary =
    [
      form.podScheduling?.podSecurityContext?.runAsUser != null
        ? `UID: ${form.podScheduling.podSecurityContext.runAsUser}`
        : null,
      form.podScheduling?.podSecurityContext?.runAsGroup != null
        ? `GID: ${form.podScheduling.podSecurityContext.runAsGroup}`
        : null,
      form.podScheduling?.podSecurityContext?.runAsNonRoot ? "Non-Root" : null,
      form.podScheduling?.podSecurityContext?.fsGroup != null
        ? `fsGroup: ${form.podScheduling.podSecurityContext.fsGroup}`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const serviceMetadataSummary =
    [
      form.podService != null ? "Pod Service" : null,
      form.headlessService?.annotations || form.headlessService?.labels ? "Headless Service" : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  const rackIDOverrideSummary = form.enableRackIDOverride ? "Enabled" : "Disabled";

  return (
    <div className="space-y-3">
      <p className="text-base-content/60 text-sm">
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

      <CollapsibleSection title="Sidecars & Init Containers" summary={sidecarsSummary}>
        <WizardSidecarsStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Pod Security Context" summary={securityContextSummary}>
        <WizardPodSecurityContextStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Node Block List" summary={nodeBlockListSummary}>
        <WizardNodeBlockListStep form={form} updateForm={updateForm} nodes={nodes} />
      </CollapsibleSection>

      <CollapsibleSection title="Bandwidth Limits" summary={bandwidthSummary}>
        <WizardBandwidthStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Validation Policy" summary={validationPolicySummary}>
        <WizardValidationPolicyStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Service Metadata" summary={serviceMetadataSummary}>
        <WizardServiceMetadataStep form={form} updateForm={updateForm} />
      </CollapsibleSection>

      <CollapsibleSection title="Rack ID Override" summary={rackIDOverrideSummary}>
        <WizardRackIDOverrideStep form={form} updateForm={updateForm} />
      </CollapsibleSection>
    </div>
  );
}

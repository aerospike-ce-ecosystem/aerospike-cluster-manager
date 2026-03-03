import type { WizardReviewStepProps } from "./types";

export function WizardReviewStep({ form, formatBytes }: WizardReviewStepProps) {
  return (
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

        {form.networkPolicy && form.networkPolicy.accessType !== "pod" && (
          <>
            <span className="text-muted-foreground">Network Access</span>
            <span className="font-medium">
              {form.networkPolicy.accessType}
              {form.networkPolicy.fabricType
                ? `, fabric: ${form.networkPolicy.fabricType}`
                : ""}
            </span>
          </>
        )}

        {form.storage && (
          <>
            <span className="text-muted-foreground">Storage</span>
            <span className="font-medium">
              {form.storage.size} ({form.storage.storageClass})
              {form.storage.initMethod ? `, init: ${form.storage.initMethod}` : ""}
              {form.storage.wipeMethod ? `, wipe: ${form.storage.wipeMethod}` : ""}
              {form.storage.cascadeDelete === false ? ", no cascade delete" : ""}
            </span>
          </>
        )}

        <span className="text-muted-foreground">Auto-connect</span>
        <span className="font-medium">{form.autoConnect ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}

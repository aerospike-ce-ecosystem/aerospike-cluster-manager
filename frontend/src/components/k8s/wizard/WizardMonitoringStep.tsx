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
import type { NetworkAccessType } from "@/lib/api/types";
import type { WizardMonitoringStepProps } from "./types";

export function WizardMonitoringStep({ form, updateForm }: WizardMonitoringStepProps) {
  const hasConfiguredIP =
    form.networkPolicy?.accessType === "configuredIP" ||
    form.networkPolicy?.alternateAccessType === "configuredIP" ||
    form.networkPolicy?.fabricType === "configuredIP";

  return (
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

      <div className="flex items-center space-x-2">
        <Checkbox
          id="dynamic-config"
          checked={form.enableDynamicConfig ?? false}
          onCheckedChange={(checked) => updateForm({ enableDynamicConfig: checked === true })}
        />
        <Label htmlFor="dynamic-config" className="text-sm font-normal">
          Enable dynamic config (apply config changes without restart)
        </Label>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <span className="text-sm font-medium">Network Access</span>
        <p className="text-muted-foreground text-xs">
          Configure how clients and nodes communicate with the Aerospike cluster.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="access-type" className="text-xs">
              Client Access Type
            </Label>
            <Select
              value={form.networkPolicy?.accessType || "pod"}
              onValueChange={(v) => {
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy:
                    v === "pod" && !current.alternateAccessType && !current.fabricType
                      ? undefined
                      : { ...current, accessType: v as NetworkAccessType },
                });
              }}
            >
              <SelectTrigger id="access-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP (default)</SelectItem>
                <SelectItem value="hostInternal">Host Internal IP</SelectItem>
                <SelectItem value="hostExternal">Host External IP</SelectItem>
                <SelectItem value="configuredIP">Configured IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fabric-type" className="text-xs">
              Fabric Type (inter-node)
            </Label>
            <Select
              value={form.networkPolicy?.fabricType || "pod"}
              onValueChange={(v) => {
                const current = form.networkPolicy ?? { accessType: "pod" as const };
                updateForm({
                  networkPolicy: {
                    ...current,
                    fabricType: v === "pod" ? undefined : (v as NetworkAccessType),
                  },
                });
              }}
            >
              <SelectTrigger id="fabric-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pod">Pod IP (default)</SelectItem>
                <SelectItem value="hostInternal">Host Internal IP</SelectItem>
                <SelectItem value="hostExternal">Host External IP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasConfiguredIP && (
          <div className="mt-3 space-y-3 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Configured IP requires custom network names (comma-separated).
            </p>
            {form.networkPolicy?.accessType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-access-names" className="text-xs">
                  Access Network Names
                </Label>
                <Input
                  id="custom-access-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customAccessNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customAccessNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
            {form.networkPolicy?.alternateAccessType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-alt-access-names" className="text-xs">
                  Alternate Access Network Names
                </Label>
                <Input
                  id="custom-alt-access-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customAlternateAccessNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customAlternateAccessNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
            {form.networkPolicy?.fabricType === "configuredIP" && (
              <div className="grid gap-1">
                <Label htmlFor="custom-fabric-names" className="text-xs">
                  Fabric Network Names
                </Label>
                <Input
                  id="custom-fabric-names"
                  placeholder="e.g. networkName1,networkName2"
                  value={form.networkPolicy?.customFabricNetworkNames?.join(",") ?? ""}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateForm({
                      networkPolicy: {
                        ...form.networkPolicy!,
                        customFabricNetworkNames: names.length > 0 ? names : undefined,
                      },
                    });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Network Policy (auto-generate K8s NetworkPolicy) */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="network-policy-config"
            checked={form.networkPolicyConfig?.enabled ?? false}
            onCheckedChange={(checked) => {
              if (checked === true) {
                updateForm({ networkPolicyConfig: { enabled: true, type: "kubernetes" } });
              } else {
                updateForm({ networkPolicyConfig: undefined });
              }
            }}
          />
          <Label htmlFor="network-policy-config" className="text-sm font-normal">
            Auto-generate Kubernetes NetworkPolicy
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Automatically create K8s NetworkPolicy resources to restrict traffic to Aerospike pods.
        </p>
        {form.networkPolicyConfig?.enabled && (
          <div className="grid gap-2">
            <Label htmlFor="netpol-type" className="text-xs">
              NetworkPolicy Type
            </Label>
            <Select
              value={form.networkPolicyConfig.type}
              onValueChange={(v) =>
                updateForm({
                  networkPolicyConfig: {
                    enabled: true,
                    type: v as "kubernetes" | "cilium",
                  },
                })
              }
            >
              <SelectTrigger id="netpol-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kubernetes">Kubernetes (standard)</SelectItem>
                <SelectItem value="cilium">Cilium</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Seeds Finder Services */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="seeds-finder"
            checked={form.seedsFinderServices?.loadBalancer != null}
            onCheckedChange={(checked) => {
              if (checked === true) {
                updateForm({
                  seedsFinderServices: {
                    loadBalancer: { port: 3000, targetPort: 3000 },
                  },
                });
              } else {
                updateForm({ seedsFinderServices: undefined });
              }
            }}
          />
          <Label htmlFor="seeds-finder" className="text-sm font-normal">
            Enable Seeds Finder LoadBalancer
          </Label>
        </div>
        <p className="text-muted-foreground text-xs">
          Creates a LoadBalancer service for external seed discovery. Required for multi-cluster
          topologies or external client access.
        </p>
        {form.seedsFinderServices?.loadBalancer && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="sfs-port" className="text-xs">
                Service Port
              </Label>
              <Input
                id="sfs-port"
                type="number"
                min={1}
                max={65535}
                value={form.seedsFinderServices.loadBalancer.port}
                onChange={(e) =>
                  updateForm({
                    seedsFinderServices: {
                      loadBalancer: {
                        ...form.seedsFinderServices!.loadBalancer!,
                        port: parseInt(e.target.value) || 3000,
                      },
                    },
                  })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sfs-target-port" className="text-xs">
                Target Port
              </Label>
              <Input
                id="sfs-target-port"
                type="number"
                min={1}
                max={65535}
                value={form.seedsFinderServices.loadBalancer.targetPort}
                onChange={(e) =>
                  updateForm({
                    seedsFinderServices: {
                      loadBalancer: {
                        ...form.seedsFinderServices!.loadBalancer!,
                        targetPort: parseInt(e.target.value) || 3000,
                      },
                    },
                  })
                }
              />
            </div>
            <div className="col-span-2 grid gap-1">
              <Label htmlFor="sfs-traffic-policy" className="text-xs">
                External Traffic Policy
              </Label>
              <Select
                value={form.seedsFinderServices.loadBalancer.externalTrafficPolicy ?? "Cluster"}
                onValueChange={(v) =>
                  updateForm({
                    seedsFinderServices: {
                      loadBalancer: {
                        ...form.seedsFinderServices!.loadBalancer!,
                        externalTrafficPolicy: v as "Cluster" | "Local",
                      },
                    },
                  })
                }
              >
                <SelectTrigger id="sfs-traffic-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cluster">Cluster (default)</SelectItem>
                  <SelectItem value="Local">Local</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/common/loading-button";
import { getErrorMessage } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { KeyValueEditor } from "@/components/common/key-value-editor";
import { Plus, X } from "lucide-react";
import type {
  K8sClusterDetail,
  UpdateK8sClusterRequest,
  NetworkAccessType,
  BandwidthConfig,
} from "@/lib/api/types";
import { useEditDialogState } from "./hooks/use-edit-dialog-state";
import {
  EditMonitoringSection,
  EditPodSchedulingSection,
  EditSidecarsSection,
  EditStorageSection,
  EditSeedsFinderLBSection,
} from "./edit-sections";

interface K8sEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: K8sClusterDetail;
  onSave: (data: UpdateK8sClusterRequest) => Promise<void>;
}

export function K8sEditDialog({ open, onOpenChange, cluster, onSave }: K8sEditDialogProps) {
  const { state, patchState, initials, hasChanges, configError } = useEditDialogState(
    open,
    cluster,
  );

  const clearError = () => patchState({ error: null });

  const handleSave = async () => {
    patchState({ loading: true, error: null });
    try {
      const data: UpdateK8sClusterRequest = {};

      if (state.size !== initials.size) {
        data.size = state.size;
      }
      if (state.image !== initials.image) {
        data.image = state.image;
      }
      if (state.enableDynamicConfig !== initials.enableDynamicConfig) {
        data.enableDynamicConfig = state.enableDynamicConfig;
      }
      if (state.aerospikeConfigText !== initials.aerospikeConfigText) {
        const parsed = JSON.parse(state.aerospikeConfigText) as Record<string, unknown>;
        data.aerospikeConfig = parsed;
      }
      if (state.batchSize !== initials.batchSize && state.batchSize !== undefined) {
        data.rollingUpdateBatchSize = state.batchSize;
      }
      if (state.maxUnavailable !== initials.maxUnavailable && state.maxUnavailable !== "") {
        data.maxUnavailable = state.maxUnavailable;
      }
      if (state.disablePDB !== initials.disablePDB) {
        data.disablePDB = state.disablePDB;
      }
      if (
        state.accessType !== initials.accessType ||
        state.fabricType !== initials.fabricType ||
        state.alternateAccessType !== initials.alternateAccessType ||
        state.customAccessNames !== initials.customAccessNames ||
        state.customAltAccessNames !== initials.customAltAccessNames ||
        state.customFabricNames !== initials.customFabricNames
      ) {
        const parseNames = (s: string) => {
          const names = s
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          return names.length > 0 ? names : undefined;
        };
        data.networkPolicy = {
          accessType: state.accessType,
          ...(state.fabricType ? { fabricType: state.fabricType as NetworkAccessType } : {}),
          ...(state.alternateAccessType
            ? { alternateAccessType: state.alternateAccessType as NetworkAccessType }
            : {}),
          ...(state.accessType === "configuredIP"
            ? { customAccessNetworkNames: parseNames(state.customAccessNames) }
            : {}),
          ...(state.alternateAccessType === "configuredIP"
            ? { customAlternateAccessNetworkNames: parseNames(state.customAltAccessNames) }
            : {}),
          ...(state.fabricType === "configuredIP"
            ? { customFabricNetworkNames: parseNames(state.customFabricNames) }
            : {}),
        };
      }
      if (
        JSON.stringify(state.networkPolicyConfig) !== JSON.stringify(initials.networkPolicyConfig)
      ) {
        data.networkPolicyConfig = state.networkPolicyConfig ?? undefined;
      }
      if (state.nodeBlockList !== initials.nodeBlockList) {
        const nodes = state.nodeBlockList
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        data.k8sNodeBlockList = nodes;
      }

      if (
        state.bandwidthIngress !== initials.bandwidthIngress ||
        state.bandwidthEgress !== initials.bandwidthEgress
      ) {
        const bw: BandwidthConfig = {};
        if (state.bandwidthIngress.trim()) bw.ingress = state.bandwidthIngress.trim();
        if (state.bandwidthEgress.trim()) bw.egress = state.bandwidthEgress.trim();
        data.bandwidthConfig = Object.keys(bw).length > 0 ? bw : undefined;
      }

      // Pod scheduling fields (all combined into one podScheduling object)
      const podSchedulingChanged =
        state.readinessGateEnabled !== initials.readinessGateEnabled ||
        state.podManagementPolicy !== initials.podManagementPolicy ||
        state.dnsPolicy !== initials.dnsPolicy ||
        JSON.stringify(state.nodeSelector) !== JSON.stringify(initials.nodeSelector) ||
        JSON.stringify(state.tolerations) !== JSON.stringify(initials.tolerations) ||
        state.multiPodPerHost !== initials.multiPodPerHost ||
        state.hostNetwork !== initials.hostNetwork ||
        state.serviceAccountName !== initials.serviceAccountName ||
        state.terminationGracePeriod !== initials.terminationGracePeriod ||
        JSON.stringify(state.imagePullSecrets) !== JSON.stringify(initials.imagePullSecrets) ||
        JSON.stringify(state.topologySpreadConstraints) !==
          JSON.stringify(initials.topologySpreadConstraints) ||
        state.podSecurityRunAsUser !== initials.podSecurityRunAsUser ||
        state.podSecurityRunAsGroup !== initials.podSecurityRunAsGroup ||
        state.podSecurityRunAsNonRoot !== initials.podSecurityRunAsNonRoot ||
        state.podSecurityFsGroup !== initials.podSecurityFsGroup ||
        JSON.stringify(state.podSecuritySupGroups) !==
          JSON.stringify(initials.podSecuritySupGroups);
      if (podSchedulingChanged) {
        data.podScheduling = {
          ...data.podScheduling,
          readinessGateEnabled: state.readinessGateEnabled || undefined,
          podManagementPolicy:
            state.podManagementPolicy === ""
              ? undefined
              : (state.podManagementPolicy as "OrderedReady" | "Parallel"),
          dnsPolicy: state.dnsPolicy || undefined,
          nodeSelector: Object.keys(state.nodeSelector).length > 0 ? state.nodeSelector : undefined,
          tolerations: state.tolerations.length > 0 ? state.tolerations : undefined,
          multiPodPerHost: state.multiPodPerHost || undefined,
          hostNetwork: state.hostNetwork || undefined,
          serviceAccountName: state.serviceAccountName || undefined,
          terminationGracePeriodSeconds: state.terminationGracePeriod,
          imagePullSecrets: state.imagePullSecrets.length > 0 ? state.imagePullSecrets : undefined,
          topologySpreadConstraints:
            state.topologySpreadConstraints.length > 0
              ? state.topologySpreadConstraints
              : undefined,
          podSecurityContext:
            state.podSecurityRunAsUser != null ||
            state.podSecurityRunAsGroup != null ||
            state.podSecurityRunAsNonRoot ||
            state.podSecurityFsGroup != null ||
            state.podSecuritySupGroups.length > 0
              ? {
                  runAsUser: state.podSecurityRunAsUser,
                  runAsGroup: state.podSecurityRunAsGroup,
                  runAsNonRoot: state.podSecurityRunAsNonRoot || undefined,
                  fsGroup: state.podSecurityFsGroup,
                  supplementalGroups:
                    state.podSecuritySupGroups.length > 0 ? state.podSecuritySupGroups : undefined,
                }
              : undefined,
        };
      }

      // Pod metadata
      const podMetaChanged =
        state.podMetadataLabels !== initials.podMetadataLabels ||
        state.podMetadataAnnotations !== initials.podMetadataAnnotations;
      if (podMetaChanged) {
        const parseKvPairs = (s: string) => {
          const result: Record<string, string> = {};
          for (const entry of s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)) {
            const eqIdx = entry.indexOf("=");
            if (eqIdx > 0) result[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
          }
          return Object.keys(result).length > 0 ? result : undefined;
        };
        data.podMetadata = {
          labels: parseKvPairs(state.podMetadataLabels),
          annotations: parseKvPairs(state.podMetadataAnnotations),
        };
      }

      // Monitoring
      if (JSON.stringify(state.monitoringConfig) !== JSON.stringify(initials.monitoringConfig)) {
        data.monitoring = state.monitoringConfig ?? undefined;
      }

      // Validation Policy
      if (state.skipWorkDirValidate !== initials.skipWorkDirValidate) {
        data.validationPolicy = state.skipWorkDirValidate
          ? { skipWorkDirValidate: true }
          : undefined;
      }

      // Sidecars & Init Containers
      if (JSON.stringify(state.sidecars) !== JSON.stringify(initials.sidecars)) {
        data.sidecars = state.sidecars.length > 0 ? state.sidecars : undefined;
      }
      if (JSON.stringify(state.initContainers) !== JSON.stringify(initials.initContainers)) {
        data.initContainers = state.initContainers.length > 0 ? state.initContainers : undefined;
      }

      // Service Metadata
      if (JSON.stringify(state.podServiceConfig) !== JSON.stringify(initials.podServiceConfig)) {
        data.podService = state.podServiceConfig ?? undefined;
      }
      if (
        JSON.stringify(state.headlessServiceConfig) !==
        JSON.stringify(initials.headlessServiceConfig)
      ) {
        data.headlessService = state.headlessServiceConfig ?? undefined;
      }

      // Rack ID Override
      if (state.enableRackIDOverride !== initials.enableRackIDOverride) {
        data.enableRackIDOverride = state.enableRackIDOverride;
      }

      // Storage (multi-volume)
      const storageChanged =
        JSON.stringify(state.storageVolumes) !== JSON.stringify(initials.storageVolumes) ||
        state.storageCleanupThreads !== initials.storageCleanupThreads ||
        state.storageDeleteLocalOnRestart !== initials.storageDeleteLocalOnRestart;
      if (storageChanged) {
        data.storage = {
          volumes: state.storageVolumes,
          ...(state.storageCleanupThreads ? { cleanupThreads: state.storageCleanupThreads } : {}),
          ...(state.storageDeleteLocalOnRestart ? { deleteLocalStorageOnRestart: true } : {}),
        };
      }

      // Seeds Finder Services
      if (
        JSON.stringify(state.seedsFinderServices) !== JSON.stringify(initials.seedsFinderServices)
      ) {
        data.seedsFinderServices = state.seedsFinderServices ?? undefined;
      }

      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      patchState({ error: getErrorMessage(err) });
    } finally {
      patchState({ loading: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Cluster</DialogTitle>
          <DialogDescription>
            Modify the configuration for &quot;{cluster.name}&quot;. Only changed fields will be
            applied.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Image */}
          <div className="grid gap-2">
            <Label htmlFor="edit-image">Image</Label>
            <Input
              id="edit-image"
              value={state.image}
              onChange={(e) => {
                patchState({ image: e.target.value });
                clearError();
              }}
              placeholder="aerospike:ce-8.1.1.1"
              disabled={state.loading}
            />
          </div>

          {/* Size */}
          <div className="grid gap-2">
            <Label htmlFor="edit-size">Cluster Size (1-8)</Label>
            <Input
              id="edit-size"
              type="number"
              min={1}
              max={8}
              value={state.size}
              onChange={(e) => {
                patchState({
                  size: Math.min(8, Math.max(1, parseInt(e.target.value) || 1)),
                });
                clearError();
              }}
              disabled={state.loading}
            />
            {state.size < initials.size && (
              <p className="text-warning text-sm">
                Scaling down will remove nodes. Data may be lost if not replicated.
              </p>
            )}
          </div>

          {/* Enable Dynamic Config */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-dynamic-config"
              checked={state.enableDynamicConfig}
              onCheckedChange={(checked) => {
                patchState({ enableDynamicConfig: checked === true });
                clearError();
              }}
              disabled={state.loading}
            />
            <Label htmlFor="edit-dynamic-config" className="cursor-pointer">
              Enable Dynamic Config Update
            </Label>
          </div>

          {/* Monitoring */}
          <EditMonitoringSection
            config={state.monitoringConfig}
            onChange={(cfg) => {
              patchState({ monitoringConfig: cfg });
              clearError();
            }}
            disabled={state.loading}
          />

          {/* Rolling Update Strategy */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Rolling Update Strategy</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-batch-size" className="text-xs">
                  Batch Size
                </Label>
                <Input
                  id="edit-batch-size"
                  type="number"
                  min={1}
                  value={state.batchSize ?? ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    patchState({ batchSize: isNaN(val) ? undefined : Math.max(1, val) });
                    clearError();
                  }}
                  placeholder="e.g. 1"
                  disabled={state.loading}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-max-unavailable" className="text-xs">
                  Max Unavailable
                </Label>
                <Input
                  id="edit-max-unavailable"
                  value={state.maxUnavailable}
                  onChange={(e) => {
                    patchState({ maxUnavailable: e.target.value });
                    clearError();
                  }}
                  placeholder="e.g. 1 or 25%"
                  disabled={state.loading}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-disable-pdb"
                checked={state.disablePDB}
                onCheckedChange={(checked) => {
                  patchState({ disablePDB: checked === true });
                  clearError();
                }}
                disabled={state.loading}
              />
              <Label htmlFor="edit-disable-pdb" className="cursor-pointer text-xs">
                Disable PodDisruptionBudget (PDB)
              </Label>
            </div>
          </div>

          {/* Network Policy */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Network Policy</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-access-type" className="text-xs">
                  Access Type
                </Label>
                <Select
                  value={state.accessType}
                  onChange={(e) => {
                    patchState({ accessType: e.target.value as NetworkAccessType });
                    clearError();
                  }}
                  id="edit-access-type"
                  disabled={state.loading}
                >
                  <option value="pod">Pod IP</option>
                  <option value="hostInternal">Host Internal</option>
                  <option value="hostExternal">Host External</option>
                  <option value="configuredIP">Configured IP</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-fabric-type" className="text-xs">
                  Fabric Type
                </Label>
                <Select
                  value={state.fabricType || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchState({
                      fabricType: v === "default" ? "" : (v as NetworkAccessType),
                    });
                    clearError();
                  }}
                  id="edit-fabric-type"
                  disabled={state.loading}
                >
                  <option value="default">Default (same as access)</option>
                  <option value="pod">Pod IP</option>
                  <option value="hostInternal">Host Internal</option>
                  <option value="hostExternal">Host External</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-alt-access" className="text-xs">
                  Alternate Access
                </Label>
                <Select
                  value={state.alternateAccessType || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchState({
                      alternateAccessType: v === "default" ? "" : (v as NetworkAccessType),
                    });
                    clearError();
                  }}
                  id="edit-alt-access"
                  disabled={state.loading}
                >
                  <option value="default">None</option>
                  <option value="pod">Pod IP</option>
                  <option value="hostInternal">Host Internal</option>
                  <option value="hostExternal">Host External</option>
                  <option value="configuredIP">Configured IP</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Custom Network Names (shown when configuredIP is selected) */}
          {(state.accessType === "configuredIP" ||
            state.alternateAccessType === "configuredIP" ||
            state.fabricType === "configuredIP") && (
            <div className="grid gap-2 rounded border border-amber-200 p-3 dark:border-amber-800">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Custom network names required for configuredIP
              </span>
              {state.accessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-access" className="text-xs">
                    Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-access"
                    value={state.customAccessNames}
                    onChange={(e) => patchState({ customAccessNames: e.target.value })}
                    placeholder="networkName1, networkName2"
                    disabled={state.loading}
                  />
                </div>
              )}
              {state.alternateAccessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-alt-access" className="text-xs">
                    Alternate Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-alt-access"
                    value={state.customAltAccessNames}
                    onChange={(e) => patchState({ customAltAccessNames: e.target.value })}
                    placeholder="networkName1, networkName2"
                    disabled={state.loading}
                  />
                </div>
              )}
              {state.fabricType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-fabric" className="text-xs">
                    Fabric Network Names
                  </Label>
                  <Input
                    id="edit-custom-fabric"
                    value={state.customFabricNames}
                    onChange={(e) => patchState({ customFabricNames: e.target.value })}
                    placeholder="networkName1, networkName2"
                    disabled={state.loading}
                  />
                </div>
              )}
            </div>
          )}

          {/* NetworkPolicy Auto-generation */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-netpol-auto"
                checked={state.networkPolicyConfig?.enabled ?? false}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    patchState({
                      networkPolicyConfig: { enabled: true, type: "kubernetes" },
                    });
                  } else {
                    patchState({ networkPolicyConfig: null });
                  }
                  clearError();
                }}
                disabled={state.loading}
              />
              <Label htmlFor="edit-netpol-auto" className="cursor-pointer text-xs">
                Auto-generate K8s NetworkPolicy
              </Label>
            </div>
            {state.networkPolicyConfig?.enabled && (
              <Select
                value={state.networkPolicyConfig.type}
                onChange={(e) => {
                  patchState({
                    networkPolicyConfig: {
                      enabled: true,
                      type: e.target.value as "kubernetes" | "cilium",
                    },
                  });
                  clearError();
                }}
                disabled={state.loading}
              >
                <option value="kubernetes">Kubernetes (standard)</option>
                <option value="cilium">Cilium</option>
              </Select>
            )}
          </div>

          {/* Node Block List */}
          <div className="grid gap-1">
            <Label htmlFor="edit-node-blocklist" className="text-xs">
              Node Block List
            </Label>
            <Input
              id="edit-node-blocklist"
              value={state.nodeBlockList}
              onChange={(e) => {
                patchState({ nodeBlockList: e.target.value });
                clearError();
              }}
              placeholder="node1, node2"
              disabled={state.loading}
            />
            <p className="text-base-content/60 text-[10px]">
              Comma-separated K8s node names to exclude from scheduling
            </p>
          </div>

          {/* Bandwidth Limits */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Bandwidth Limits</Label>
            <p className="text-base-content/60 text-[10px]">
              CNI bandwidth shaping for Aerospike pods (e.g. &quot;1M&quot;, &quot;10M&quot;,
              &quot;100M&quot;)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-bw-ingress" className="text-xs">
                  Ingress
                </Label>
                <Input
                  id="edit-bw-ingress"
                  value={state.bandwidthIngress}
                  onChange={(e) => {
                    patchState({ bandwidthIngress: e.target.value });
                    clearError();
                  }}
                  placeholder="e.g. 10M"
                  disabled={state.loading}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-bw-egress" className="text-xs">
                  Egress
                </Label>
                <Input
                  id="edit-bw-egress"
                  value={state.bandwidthEgress}
                  onChange={(e) => {
                    patchState({ bandwidthEgress: e.target.value });
                    clearError();
                  }}
                  placeholder="e.g. 10M"
                  disabled={state.loading}
                />
              </div>
            </div>
          </div>

          {/* Pod Settings */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Pod Settings</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-readiness-gate"
                checked={state.readinessGateEnabled}
                onCheckedChange={(checked) => {
                  patchState({ readinessGateEnabled: checked === true });
                  clearError();
                }}
                disabled={state.loading}
              />
              <Label htmlFor="edit-readiness-gate" className="cursor-pointer text-xs">
                Enable Readiness Gate (acko.io/aerospike-ready)
              </Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-pod-mgmt-policy" className="text-xs">
                  Pod Management Policy
                </Label>
                <Select
                  value={state.podManagementPolicy || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchState({ podManagementPolicy: v === "default" ? "" : v });
                    clearError();
                  }}
                  id="edit-pod-mgmt-policy"
                  disabled={state.loading}
                >
                  <option value="default">Default (OrderedReady)</option>
                  <option value="OrderedReady">OrderedReady</option>
                  <option value="Parallel">Parallel</option>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-dns-policy" className="text-xs">
                  DNS Policy
                </Label>
                <Select
                  value={state.dnsPolicy || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    patchState({ dnsPolicy: v === "default" ? "" : v });
                    clearError();
                  }}
                  id="edit-dns-policy"
                  disabled={state.loading}
                >
                  <option value="default">Default (ClusterFirst)</option>
                  <option value="ClusterFirst">ClusterFirst</option>
                  <option value="ClusterFirstWithHostNet">ClusterFirstWithHostNet</option>
                  <option value="Default">Default</option>
                  <option value="None">None</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Pod Labels (key=value, ...)</Label>
                <Input
                  value={state.podMetadataLabels}
                  onChange={(e) => {
                    patchState({ podMetadataLabels: e.target.value });
                    clearError();
                  }}
                  placeholder="e.g. app=aerospike, team=data"
                  disabled={state.loading}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Pod Annotations (key=value, ...)</Label>
                <Input
                  value={state.podMetadataAnnotations}
                  onChange={(e) => {
                    patchState({ podMetadataAnnotations: e.target.value });
                    clearError();
                  }}
                  placeholder="e.g. prometheus.io/scrape=true"
                  disabled={state.loading}
                />
              </div>
            </div>
          </div>

          {/* Pod Scheduling */}
          <EditPodSchedulingSection
            nodeSelector={state.nodeSelector}
            onNodeSelectorChange={(v) => {
              patchState({ nodeSelector: v });
              clearError();
            }}
            tolerations={state.tolerations}
            onTolerationsChange={(v) => {
              patchState({ tolerations: v });
              clearError();
            }}
            multiPodPerHost={state.multiPodPerHost}
            onMultiPodPerHostChange={(v) => {
              patchState({ multiPodPerHost: v });
              clearError();
            }}
            hostNetwork={state.hostNetwork}
            onHostNetworkChange={(v) => {
              patchState({ hostNetwork: v });
              clearError();
            }}
            serviceAccountName={state.serviceAccountName}
            onServiceAccountNameChange={(v) => {
              patchState({ serviceAccountName: v });
              clearError();
            }}
            terminationGracePeriod={state.terminationGracePeriod}
            onTerminationGracePeriodChange={(v) => {
              patchState({ terminationGracePeriod: v });
              clearError();
            }}
            imagePullSecrets={state.imagePullSecrets}
            onImagePullSecretsChange={(v) => {
              patchState({ imagePullSecrets: v });
              clearError();
            }}
            disabled={state.loading}
          />

          {/* Storage (Multi-Volume) */}
          <CollapsibleSection
            title="Storage Volumes"
            summary={
              state.storageVolumes.length > 0
                ? `${state.storageVolumes.length} volume${state.storageVolumes.length !== 1 ? "s" : ""}`
                : "Not configured"
            }
            size="sm"
          >
            <EditStorageSection
              volumes={state.storageVolumes}
              cleanupThreads={state.storageCleanupThreads}
              deleteLocalOnRestart={state.storageDeleteLocalOnRestart}
              onVolumesChange={(v) => patchState({ storageVolumes: v })}
              onCleanupThreadsChange={(v) => patchState({ storageCleanupThreads: v })}
              onDeleteLocalChange={(v) => patchState({ storageDeleteLocalOnRestart: v })}
              loading={state.loading}
            />
          </CollapsibleSection>

          {/* Topology Spread Constraints */}
          <CollapsibleSection
            title="Topology Spread Constraints"
            summary={
              state.topologySpreadConstraints.length > 0
                ? `${state.topologySpreadConstraints.length} constraint(s)`
                : "None"
            }
            size="sm"
          >
            <div className="space-y-3">
              <p className="text-base-content/60 text-[10px]">
                Control how pods are spread across topology domains.
              </p>
              {state.topologySpreadConstraints.map((tsc, idx) => (
                <div key={idx} className="space-y-2 rounded border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium">Constraint #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        patchState({
                          topologySpreadConstraints: state.topologySpreadConstraints.filter(
                            (_, i) => i !== idx,
                          ),
                        });
                        clearError();
                      }}
                      className="text-base-content/60 hover:text-error p-0.5"
                      disabled={state.loading}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Max Skew</Label>
                      <Input
                        type="number"
                        min={1}
                        value={tsc.maxSkew}
                        onChange={(e) => {
                          const next = [...state.topologySpreadConstraints];
                          next[idx] = { ...next[idx], maxSkew: parseInt(e.target.value) || 1 };
                          patchState({ topologySpreadConstraints: next });
                          clearError();
                        }}
                        className="h-7 text-[10px]"
                        disabled={state.loading}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Topology Key</Label>
                      <Select
                        value={tsc.topologyKey}
                        onChange={(e) => {
                          const next = [...state.topologySpreadConstraints];
                          next[idx] = { ...next[idx], topologyKey: e.target.value };
                          patchState({ topologySpreadConstraints: next });
                          clearError();
                        }}
                        className="h-7 text-[10px]"
                        disabled={state.loading}
                      >
                        <option value="topology.kubernetes.io/zone">
                          topology.kubernetes.io/zone
                        </option>
                        <option value="kubernetes.io/hostname">kubernetes.io/hostname</option>
                        <option value="topology.kubernetes.io/region">
                          topology.kubernetes.io/region
                        </option>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">When Unsatisfiable</Label>
                      <Select
                        value={tsc.whenUnsatisfiable}
                        onChange={(e) => {
                          const next = [...state.topologySpreadConstraints];
                          next[idx] = {
                            ...next[idx],
                            whenUnsatisfiable: e.target.value as "DoNotSchedule" | "ScheduleAnyway",
                          };
                          patchState({ topologySpreadConstraints: next });
                          clearError();
                        }}
                        className="h-7 text-[10px]"
                        disabled={state.loading}
                      >
                        <option value="DoNotSchedule">DoNotSchedule</option>
                        <option value="ScheduleAnyway">ScheduleAnyway</option>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">
                      Label Selector (key=value, comma-separated)
                    </Label>
                    <Input
                      value={
                        tsc.labelSelector
                          ? Object.entries(tsc.labelSelector)
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
                          const eqIdx = entry.indexOf("=");
                          if (eqIdx > 0) {
                            labels[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
                          }
                        }
                        const next = [...state.topologySpreadConstraints];
                        next[idx] = {
                          ...next[idx],
                          labelSelector: Object.keys(labels).length > 0 ? labels : undefined,
                        };
                        patchState({ topologySpreadConstraints: next });
                        clearError();
                      }}
                      placeholder="e.g. app=aerospike"
                      className="h-7 text-[10px]"
                      disabled={state.loading}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  patchState({
                    topologySpreadConstraints: [
                      ...state.topologySpreadConstraints,
                      {
                        maxSkew: 1,
                        topologyKey: "topology.kubernetes.io/zone",
                        whenUnsatisfiable: "DoNotSchedule",
                      },
                    ],
                  });
                  clearError();
                }}
                className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium"
                disabled={state.loading}
              >
                <Plus className="h-3 w-3" /> Add Constraint
              </button>
            </div>
          </CollapsibleSection>

          {/* Pod Security Context */}
          <CollapsibleSection
            title="Pod Security Context"
            summary={
              [
                state.podSecurityRunAsUser != null ? `UID: ${state.podSecurityRunAsUser}` : null,
                state.podSecurityRunAsGroup != null ? `GID: ${state.podSecurityRunAsGroup}` : null,
                state.podSecurityRunAsNonRoot ? "Non-Root" : null,
                state.podSecurityFsGroup != null ? `fsGroup: ${state.podSecurityFsGroup}` : null,
              ]
                .filter(Boolean)
                .join(", ") || "Default"
            }
            size="sm"
          >
            <div className="space-y-3">
              <p className="text-base-content/60 text-[10px]">
                Configure the pod-level security context.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="edit-run-as-user" className="text-[10px]">
                    Run As User
                  </Label>
                  <Input
                    id="edit-run-as-user"
                    type="number"
                    min={0}
                    value={state.podSecurityRunAsUser ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      patchState({
                        podSecurityRunAsUser: val ? parseInt(val, 10) : undefined,
                      });
                      clearError();
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={state.loading}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="edit-run-as-group" className="text-[10px]">
                    Run As Group
                  </Label>
                  <Input
                    id="edit-run-as-group"
                    type="number"
                    min={0}
                    value={state.podSecurityRunAsGroup ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      patchState({
                        podSecurityRunAsGroup: val ? parseInt(val, 10) : undefined,
                      });
                      clearError();
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={state.loading}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="edit-fs-group" className="text-[10px]">
                    FS Group
                  </Label>
                  <Input
                    id="edit-fs-group"
                    type="number"
                    min={0}
                    value={state.podSecurityFsGroup ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      patchState({
                        podSecurityFsGroup: val ? parseInt(val, 10) : undefined,
                      });
                      clearError();
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={state.loading}
                  />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Switch
                    id="edit-run-as-non-root"
                    checked={state.podSecurityRunAsNonRoot}
                    onCheckedChange={(checked) => {
                      patchState({ podSecurityRunAsNonRoot: checked });
                      clearError();
                    }}
                    disabled={state.loading}
                  />
                  <Label htmlFor="edit-run-as-non-root" className="cursor-pointer text-[10px]">
                    Run As Non-Root
                  </Label>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold">Supplemental Groups</Label>
                {state.podSecuritySupGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {state.podSecuritySupGroups.map((gid) => (
                      <span
                        key={gid}
                        className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      >
                        {gid}
                        <button
                          type="button"
                          onClick={() => {
                            patchState({
                              podSecuritySupGroups: state.podSecuritySupGroups.filter(
                                (g) => g !== gid,
                              ),
                            });
                            clearError();
                          }}
                          className="hover:bg-accent/20 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full"
                          disabled={state.loading}
                        >
                          <X className="h-2 w-2" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <EditSupGroupInput
                  onAdd={(gid) => {
                    if (!state.podSecuritySupGroups.includes(gid)) {
                      patchState({
                        podSecuritySupGroups: [...state.podSecuritySupGroups, gid],
                      });
                      clearError();
                    }
                  }}
                  disabled={state.loading}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* Validation Policy */}
          <CollapsibleSection
            title="Validation Policy"
            summary={state.skipWorkDirValidate ? "Skip WorkDir Validate" : "Default"}
            size="sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="edit-skip-workdir" className="cursor-pointer text-xs">
                  Skip Work Dir Validate
                </Label>
                <p className="text-base-content/60 text-[10px]">
                  Skip validation of the working directory on pod startup.
                </p>
              </div>
              <Switch
                id="edit-skip-workdir"
                checked={state.skipWorkDirValidate}
                onCheckedChange={(checked) => {
                  patchState({ skipWorkDirValidate: checked });
                  clearError();
                }}
                disabled={state.loading}
              />
            </div>
          </CollapsibleSection>

          {/* Sidecars & Init Containers */}
          <EditSidecarsSection
            sidecars={state.sidecars}
            initContainers={state.initContainers}
            onSidecarsChange={(v) => patchState({ sidecars: v })}
            onInitContainersChange={(v) => patchState({ initContainers: v })}
            loading={state.loading}
          />

          {/* Service Metadata */}
          <CollapsibleSection
            title="Service Metadata"
            summary={
              [
                state.podServiceConfig != null ? "Pod Service" : null,
                state.headlessServiceConfig?.annotations || state.headlessServiceConfig?.labels
                  ? "Headless Service"
                  : null,
              ]
                .filter(Boolean)
                .join(", ") || "Default"
            }
            size="sm"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="edit-pod-service" className="cursor-pointer text-xs">
                    Enable per-pod Service
                  </Label>
                  <p className="text-muted-foreground text-[10px]">
                    Create a dedicated K8s Service for each Aerospike pod.
                  </p>
                </div>
                <Switch
                  id="edit-pod-service"
                  checked={state.podServiceConfig != null}
                  onCheckedChange={(checked) => {
                    patchState({ podServiceConfig: checked ? {} : null });
                    clearError();
                  }}
                  disabled={state.loading}
                />
              </div>
              {state.podServiceConfig != null && (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Pod Service Annotations</Label>
                    <KeyValueEditor
                      value={state.podServiceConfig.annotations}
                      onChange={(v) =>
                        patchState({
                          podServiceConfig: { ...state.podServiceConfig!, annotations: v },
                        })
                      }
                      keyPlaceholder="annotation key"
                      valuePlaceholder="value"
                      disabled={state.loading}
                      size="sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Pod Service Labels</Label>
                    <KeyValueEditor
                      value={state.podServiceConfig.labels}
                      onChange={(v) =>
                        patchState({
                          podServiceConfig: { ...state.podServiceConfig!, labels: v },
                        })
                      }
                      keyPlaceholder="label key"
                      valuePlaceholder="value"
                      disabled={state.loading}
                      size="sm"
                    />
                  </div>
                </div>
              )}

              <div className="border-t pt-3">
                <Label className="text-xs font-semibold">Headless Service Metadata</Label>
                <p className="text-muted-foreground mb-2 text-[10px]">
                  Custom annotations and labels for the headless Service.
                </p>
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Annotations</Label>
                    <KeyValueEditor
                      value={state.headlessServiceConfig?.annotations}
                      onChange={(v) => {
                        const next = { ...state.headlessServiceConfig, annotations: v };
                        if (!next.annotations && !next.labels) {
                          patchState({ headlessServiceConfig: null });
                        } else {
                          patchState({ headlessServiceConfig: next });
                        }
                        clearError();
                      }}
                      keyPlaceholder="annotation key"
                      valuePlaceholder="value"
                      disabled={state.loading}
                      size="sm"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Labels</Label>
                    <KeyValueEditor
                      value={state.headlessServiceConfig?.labels}
                      onChange={(v) => {
                        const next = { ...state.headlessServiceConfig, labels: v };
                        if (!next.annotations && !next.labels) {
                          patchState({ headlessServiceConfig: null });
                        } else {
                          patchState({ headlessServiceConfig: next });
                        }
                        clearError();
                      }}
                      keyPlaceholder="label key"
                      valuePlaceholder="value"
                      disabled={state.loading}
                      size="sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Rack ID Override */}
          <CollapsibleSection
            title="Rack ID Override"
            summary={state.enableRackIDOverride ? "Enabled" : "Disabled"}
            size="sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="edit-rack-id-override" className="cursor-pointer text-xs">
                  Enable Rack ID Override
                </Label>
                <p className="text-muted-foreground text-[10px]">
                  Allow rack ID override for existing data migration. When enabled, the operator
                  dynamically assigns rack IDs to pods, useful when migrating data from an existing
                  cluster with different rack configurations.
                </p>
              </div>
              <Switch
                id="edit-rack-id-override"
                checked={state.enableRackIDOverride}
                onCheckedChange={(checked) => {
                  patchState({ enableRackIDOverride: checked });
                  clearError();
                }}
                disabled={state.loading}
              />
            </div>
          </CollapsibleSection>

          {/* Seeds Finder Services */}
          <CollapsibleSection
            title="Seeds Finder Services"
            summary={
              state.seedsFinderServices?.loadBalancer
                ? `LB port ${state.seedsFinderServices.loadBalancer.port}/${state.seedsFinderServices.loadBalancer.targetPort}`
                : "Disabled"
            }
            size="sm"
          >
            <div className="space-y-3">
              <p className="text-base-content/60 text-[10px]">
                Configure a LoadBalancer service for external seed discovery.
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="edit-seeds-finder-lb" className="cursor-pointer text-xs">
                    Enable Seeds Finder LoadBalancer
                  </Label>
                  <p className="text-base-content/60 text-[10px]">
                    Required for multi-cluster topologies or external client access.
                  </p>
                </div>
                <Switch
                  id="edit-seeds-finder-lb"
                  checked={state.seedsFinderServices?.loadBalancer != null}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      patchState({
                        seedsFinderServices: {
                          loadBalancer: { port: 3000, targetPort: 3000 },
                        },
                      });
                    } else {
                      patchState({ seedsFinderServices: null });
                    }
                    clearError();
                  }}
                  disabled={state.loading}
                />
              </div>
              {state.seedsFinderServices?.loadBalancer && (
                <EditSeedsFinderLBSection
                  lb={state.seedsFinderServices.loadBalancer}
                  onChange={(lb) => patchState({ seedsFinderServices: { loadBalancer: lb } })}
                  loading={state.loading}
                  setError={(e) => patchState({ error: e })}
                />
              )}
            </div>
          </CollapsibleSection>

          {/* Aerospike Config */}
          <div className="grid gap-2">
            <Label htmlFor="edit-aerospike-config">Aerospike Config (JSON)</Label>
            <Textarea
              id="edit-aerospike-config"
              value={state.aerospikeConfigText}
              onChange={(e) => {
                patchState({ aerospikeConfigText: e.target.value });
                clearError();
              }}
              rows={12}
              className="font-mono text-xs"
              placeholder='{"service": {...}, "network": {...}, "namespaces": [...]}'
              disabled={state.loading}
            />
            {configError && <p className="text-error text-sm">{configError}</p>}
          </div>

          {state.error && <p className="text-error text-sm">{state.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state.loading}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSave}
            loading={state.loading}
            disabled={!hasChanges || state.loading || !!configError}
          >
            Save Changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small input for adding supplemental group GIDs. */
function EditSupGroupInput({
  onAdd,
  disabled,
}: {
  onAdd: (gid: number) => void;
  disabled?: boolean;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) {
      onAdd(n);
      setVal("");
    }
  };
  return (
    <div className="flex gap-1.5">
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        type="number"
        min={0}
        placeholder="e.g. 1000"
        className="h-7 w-24 text-[10px]"
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 shrink-0 text-[10px]"
        onClick={add}
        disabled={disabled || !val.trim() || isNaN(parseInt(val, 10))}
      >
        <Plus className="mr-0.5 h-3 w-3" /> Add
      </Button>
    </div>
  );
}

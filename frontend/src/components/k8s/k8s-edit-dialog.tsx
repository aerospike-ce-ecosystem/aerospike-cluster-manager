"use client";

import { useState, useEffect } from "react";
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
import type {
  K8sClusterDetail,
  UpdateK8sClusterRequest,
  NetworkAccessType,
  BandwidthConfig,
  K8sNodeInfo,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { validateACLConfig } from "@/lib/validations/k8s-acl";
import {
  validateCEImage,
  validateAerospikeConfig,
  validateRackUpdate,
} from "@/lib/validations/k8s";
import { useEditDialogState } from "./hooks/use-edit-dialog-state";
import {
  EditAclSection,
  EditMonitoringSection,
  EditNetworkSection,
  EditPodSchedulingSection,
  EditPodSecuritySection,
  EditResourcesSection,
  EditServiceMetadataSection,
  EditSidecarsSection,
  EditStorageSection,
  EditSeedsFinderLBSection,
  EditTopologySpreadSection,
  EditRackConfigSection,
  EditNodeBlocklistSection,
  EditContainerSecuritySection,
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

  // Fetch K8s nodes once when dialog opens (shared by RackConfig and NodeBlocklist)
  const [k8sNodes, setK8sNodes] = useState<K8sNodeInfo[]>([]);
  const [k8sNodesLoading, setK8sNodesLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setK8sNodesLoading(true);
    api
      .getK8sNodes()
      .then((n) => {
        if (!cancelled) setK8sNodes(n);
      })
      .catch(() => {
        if (!cancelled) setK8sNodes([]);
      })
      .finally(() => {
        if (!cancelled) setK8sNodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const clearError = () => patchState({ error: null });

  const handleSave = async () => {
    patchState({ loading: true, error: null });
    try {
      // ── Pre-save validations ──
      // CE image version check
      const imageErr = validateCEImage(state.image);
      if (imageErr) {
        patchState({ error: imageErr, loading: false });
        return;
      }

      // Replication factor vs cluster size cross-validation
      if (cluster.spec?.aerospikeConfig) {
        const nsList = (cluster.spec.aerospikeConfig as Record<string, unknown>).namespaces as
          | Array<Record<string, unknown>>
          | undefined;
        if (nsList) {
          for (const ns of nsList) {
            const replFactor = (ns["replication-factor"] as number) ?? 2;
            if (replFactor > state.size) {
              patchState({
                error: `Namespace "${ns.name}" replication factor (${replFactor}) exceeds new cluster size (${state.size}). Reduce replication factor first.`,
                loading: false,
              });
              return;
            }
          }
        }
      }

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
        // Check for Enterprise-only keys (xdr, tls)
        const configErr = validateAerospikeConfig(parsed);
        if (configErr) {
          patchState({ error: configErr, loading: false });
          return;
        }
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
        state.priorityClassName !== initials.priorityClassName ||
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
          priorityClassName: state.priorityClassName || undefined,
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

      // Rack Config
      if (JSON.stringify(state.rackConfig) !== JSON.stringify(initials.rackConfig)) {
        // Validate no simultaneous add+remove of racks
        if (state.rackConfig && initials.rackConfig) {
          const currentIds = (initials.rackConfig.racks ?? []).map((r) => r.id);
          const newIds = (state.rackConfig.racks ?? []).map((r) => r.id);
          const rackErr = validateRackUpdate(currentIds, newIds);
          if (rackErr) {
            patchState({ error: rackErr, loading: false });
            return;
          }
        }
        data.rackConfig = state.rackConfig ?? undefined;
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

      // ACL
      if (JSON.stringify(state.aclConfig) !== JSON.stringify(initials.aclConfig)) {
        if (state.aclConfig) {
          const aclError = validateACLConfig(state.aclConfig);
          if (aclError) {
            patchState({ error: aclError });
            return;
          }
        }
        data.acl = state.aclConfig ?? undefined;
      }

      // Resources — strip empty strings to avoid backend validation errors
      if (JSON.stringify(state.resources) !== JSON.stringify(initials.resources)) {
        const r = state.resources;
        if (r && (r.requests.cpu || r.requests.memory || r.limits.cpu || r.limits.memory)) {
          data.resources = r;
        } else {
          data.resources = undefined;
        }
      }

      // Container Security Context
      if (
        JSON.stringify(state.aerospikeContainerSecurityContext) !==
        JSON.stringify(initials.aerospikeContainerSecurityContext)
      ) {
        data.aerospikeContainerSecurityContext =
          state.aerospikeContainerSecurityContext !== null
            ? state.aerospikeContainerSecurityContext
            : {};
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

          {/* Resources */}
          <CollapsibleSection
            title="Resources"
            summary={
              state.resources
                ? `CPU: ${state.resources.requests.cpu || "-"}/${state.resources.limits.cpu || "-"}, Mem: ${state.resources.requests.memory || "-"}/${state.resources.limits.memory || "-"}`
                : "Not configured"
            }
            size="sm"
          >
            <EditResourcesSection
              resources={state.resources}
              onChange={(r) => {
                patchState({ resources: r });
                clearError();
              }}
              disabled={state.loading}
            />
          </CollapsibleSection>

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

          {/* ACL (Access Control) */}
          <CollapsibleSection
            title="ACL (Access Control)"
            summary={
              state.aclConfig?.enabled
                ? `${state.aclConfig.roles.length} role(s), ${state.aclConfig.users.length} user(s)`
                : "Disabled"
            }
            size="sm"
          >
            <EditAclSection
              acl={state.aclConfig}
              onChange={(acl) => {
                patchState({ aclConfig: acl });
                clearError();
              }}
              disabled={state.loading}
            />
          </CollapsibleSection>

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
          <EditNetworkSection
            accessType={state.accessType}
            fabricType={state.fabricType}
            alternateAccessType={state.alternateAccessType}
            customAccessNames={state.customAccessNames}
            customAltAccessNames={state.customAltAccessNames}
            customFabricNames={state.customFabricNames}
            networkPolicyConfig={state.networkPolicyConfig}
            disabled={state.loading}
            onAccessTypeChange={(v) => {
              patchState({ accessType: v });
              clearError();
            }}
            onFabricTypeChange={(v) => {
              patchState({ fabricType: v });
              clearError();
            }}
            onAlternateAccessTypeChange={(v) => {
              patchState({ alternateAccessType: v });
              clearError();
            }}
            onCustomAccessNamesChange={(v) => {
              patchState({ customAccessNames: v });
              clearError();
            }}
            onCustomAltAccessNamesChange={(v) => {
              patchState({ customAltAccessNames: v });
              clearError();
            }}
            onCustomFabricNamesChange={(v) => {
              patchState({ customFabricNames: v });
              clearError();
            }}
            onNetworkPolicyConfigChange={(v) => {
              patchState({ networkPolicyConfig: v });
              clearError();
            }}
          />

          {/* Node Block List */}
          <EditNodeBlocklistSection
            value={state.nodeBlockList}
            onChange={(v) => {
              patchState({ nodeBlockList: v });
              clearError();
            }}
            disabled={state.loading}
            nodes={k8sNodes}
            nodesLoading={k8sNodesLoading}
          />

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
            priorityClassName={state.priorityClassName}
            onPriorityClassNameChange={(v) => {
              patchState({ priorityClassName: v });
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
            <EditTopologySpreadSection
              constraints={state.topologySpreadConstraints}
              disabled={state.loading}
              onChange={(v) => {
                patchState({ topologySpreadConstraints: v });
                clearError();
              }}
            />
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
            <EditPodSecuritySection
              runAsUser={state.podSecurityRunAsUser}
              runAsGroup={state.podSecurityRunAsGroup}
              runAsNonRoot={state.podSecurityRunAsNonRoot}
              fsGroup={state.podSecurityFsGroup}
              supplementalGroups={state.podSecuritySupGroups}
              disabled={state.loading}
              onRunAsUserChange={(v) => {
                patchState({ podSecurityRunAsUser: v });
                clearError();
              }}
              onRunAsGroupChange={(v) => {
                patchState({ podSecurityRunAsGroup: v });
                clearError();
              }}
              onRunAsNonRootChange={(v) => {
                patchState({ podSecurityRunAsNonRoot: v });
                clearError();
              }}
              onFsGroupChange={(v) => {
                patchState({ podSecurityFsGroup: v });
                clearError();
              }}
              onSupplementalGroupsChange={(v) => {
                patchState({ podSecuritySupGroups: v });
                clearError();
              }}
            />
          </CollapsibleSection>

          {/* Container Security Context */}
          <CollapsibleSection
            title="Container Security Context"
            summary={state.aerospikeContainerSecurityContext ? "Configured" : "Default"}
            size="sm"
          >
            <EditContainerSecuritySection
              value={state.aerospikeContainerSecurityContext}
              onChange={(v) => {
                patchState({ aerospikeContainerSecurityContext: v });
                clearError();
              }}
              disabled={state.loading}
            />
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
            <EditServiceMetadataSection
              podServiceConfig={state.podServiceConfig}
              headlessServiceConfig={state.headlessServiceConfig}
              disabled={state.loading}
              onPodServiceConfigChange={(v) => {
                patchState({ podServiceConfig: v });
                clearError();
              }}
              onHeadlessServiceConfigChange={(v) => {
                patchState({ headlessServiceConfig: v });
                clearError();
              }}
            />
          </CollapsibleSection>

          {/* Rack Config */}
          <CollapsibleSection
            title="Rack Configuration"
            summary={
              state.rackConfig?.racks?.length
                ? `${state.rackConfig.racks.length} rack(s)`
                : "Single rack (default)"
            }
            size="sm"
          >
            <EditRackConfigSection
              rackConfig={state.rackConfig}
              clusterSize={state.size}
              onChange={(cfg) => {
                patchState({ rackConfig: cfg });
                clearError();
              }}
              disabled={state.loading}
              nodes={k8sNodes}
            />
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

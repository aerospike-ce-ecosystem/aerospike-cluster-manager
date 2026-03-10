"use client";

import { useState, useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type {
  K8sClusterDetail,
  UpdateK8sClusterRequest,
  NetworkAccessType,
  NetworkPolicyAutoConfig,
  PodMetadataConfig,
  BandwidthConfig,
  MonitoringConfig,
  TolerationConfig,
} from "@/lib/api/types";

interface K8sEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: K8sClusterDetail;
  onSave: (data: UpdateK8sClusterRequest) => Promise<void>;
}

export function K8sEditDialog({ open, onOpenChange, cluster, onSave }: K8sEditDialogProps) {
  const [image, setImage] = useState("");
  const [size, setSize] = useState(1);
  const [enableDynamicConfig, setEnableDynamicConfig] = useState(false);
  const [aerospikeConfigText, setAerospikeConfigText] = useState("");
  const [batchSize, setBatchSize] = useState<number | undefined>(undefined);
  const [maxUnavailable, setMaxUnavailable] = useState("");
  const [disablePDB, setDisablePDB] = useState(false);
  const [accessType, setAccessType] = useState<NetworkAccessType>("pod");
  const [fabricType, setFabricType] = useState<NetworkAccessType | "">("");
  const [alternateAccessType, setAlternateAccessType] = useState<NetworkAccessType | "">("");
  const [customAccessNames, setCustomAccessNames] = useState("");
  const [customAltAccessNames, setCustomAltAccessNames] = useState("");
  const [customFabricNames, setCustomFabricNames] = useState("");
  const [networkPolicyConfig, setNetworkPolicyConfig] = useState<NetworkPolicyAutoConfig | null>(
    null,
  );
  const [nodeBlockList, setNodeBlockList] = useState("");
  const [bandwidthIngress, setBandwidthIngress] = useState("");
  const [bandwidthEgress, setBandwidthEgress] = useState("");
  const [readinessGateEnabled, setReadinessGateEnabled] = useState(false);
  const [podMetadataLabels, setPodMetadataLabels] = useState("");
  const [podMetadataAnnotations, setPodMetadataAnnotations] = useState("");
  const [podManagementPolicy, setPodManagementPolicy] = useState<string>("");
  const [dnsPolicy, setDnsPolicy] = useState<string>("");
  const [monitoringConfig, setMonitoringConfig] = useState<MonitoringConfig | null>(null);
  // Pod Scheduling fields
  const [nodeSelector, setNodeSelector] = useState<Record<string, string>>({});
  const [tolerations, setTolerations] = useState<TolerationConfig[]>([]);
  const [multiPodPerHost, setMultiPodPerHost] = useState(false);
  const [hostNetwork, setHostNetwork] = useState(false);
  const [serviceAccountName, setServiceAccountName] = useState("");
  const [terminationGracePeriod, setTerminationGracePeriod] = useState<number | undefined>(
    undefined,
  );
  const [imagePullSecrets, setImagePullSecrets] = useState<string[]>([]);
  // Validation Policy
  const [skipWorkDirValidate, setSkipWorkDirValidate] = useState(false);
  // Service Metadata
  const [headlessServiceAnnotations, setHeadlessServiceAnnotations] = useState("");
  const [headlessServiceLabels, setHeadlessServiceLabels] = useState("");
  const [podServiceAnnotations, setPodServiceAnnotations] = useState("");
  const [podServiceLabels, setPodServiceLabels] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Derive initial values from the cluster spec
  const initialImage = cluster.image;
  const initialSize = cluster.size;
  const initialEnableDynamicConfig = Boolean(cluster.spec?.enableDynamicConfigUpdate);
  const initialBatchSize = cluster.spec?.rollingUpdateBatchSize ?? undefined;
  const initialMaxUnavailable = String(cluster.spec?.maxUnavailable ?? "");
  const initialDisablePDB = Boolean(cluster.spec?.disablePDB);
  const networkPolicy = cluster.spec?.aerospikeNetworkPolicy;
  const initialAccessType = (networkPolicy?.accessType || "pod") as NetworkAccessType;
  const initialFabricType = (networkPolicy?.fabricType || "") as NetworkAccessType | "";
  const initialAlternateAccessType = (networkPolicy?.alternateAccessType || "") as
    | NetworkAccessType
    | "";
  const initialCustomAccessNames = (networkPolicy?.customAccessNetworkNames ?? []).join(", ");
  const initialCustomAltAccessNames = (networkPolicy?.customAlternateAccessNetworkNames ?? []).join(
    ", ",
  );
  const initialCustomFabricNames = (networkPolicy?.customFabricNetworkNames ?? []).join(", ");
  const initialNetworkPolicyConfig = cluster.spec?.networkPolicyConfig ?? null;
  const initialNodeBlockList = (cluster.spec?.k8sNodeBlockList ?? []).join(", ");
  const initialBandwidthIngress = cluster.spec?.bandwidthConfig?.ingress ?? "";
  const initialBandwidthEgress = cluster.spec?.bandwidthConfig?.egress ?? "";
  const podSpec = cluster.spec?.podSpec as Record<string, unknown> | undefined;
  const initialReadinessGateEnabled = Boolean(podSpec?.readinessGateEnabled);
  const podMeta = podSpec?.metadata as PodMetadataConfig | undefined;
  const initialPodMetadataLabels = podMeta?.labels
    ? Object.entries(podMeta.labels)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  const initialPodMetadataAnnotations = podMeta?.annotations
    ? Object.entries(podMeta.annotations)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")
    : "";
  const initialPodManagementPolicy = (podSpec?.podManagementPolicy as string) || "";
  const initialDnsPolicy = (podSpec?.dnsPolicy as string) || "";
  const initialMonitoringConfig: MonitoringConfig | null = cluster.spec?.monitoring ?? null;
  // Pod Scheduling initial values from spec
  const specPodScheduling = cluster.spec?.podScheduling;
  const specPodSpec = cluster.spec?.podSpec as Record<string, unknown> | undefined;
  const initialNodeSelector: Record<string, string> =
    specPodScheduling?.nodeSelector ??
    (specPodSpec?.nodeSelector as Record<string, string> | undefined) ??
    {};
  const initialTolerations: TolerationConfig[] =
    specPodScheduling?.tolerations ??
    (specPodSpec?.tolerations as TolerationConfig[] | undefined) ??
    [];
  const initialMultiPodPerHost = Boolean(
    specPodScheduling?.multiPodPerHost ?? (specPodSpec?.multiPodPerHost as boolean | undefined),
  );
  const initialHostNetwork = Boolean(
    specPodScheduling?.hostNetwork ?? (specPodSpec?.hostNetwork as boolean | undefined),
  );
  const initialServiceAccountName =
    specPodScheduling?.serviceAccountName ??
    (specPodSpec?.serviceAccountName as string | undefined) ??
    "";
  const initialTerminationGracePeriod =
    specPodScheduling?.terminationGracePeriodSeconds ??
    (specPodSpec?.terminationGracePeriodSeconds as number | undefined) ??
    undefined;
  const initialImagePullSecrets: string[] =
    specPodScheduling?.imagePullSecrets ??
    (specPodSpec?.imagePullSecrets as string[] | undefined) ??
    [];
  // Validation Policy initial values
  const initialSkipWorkDirValidate = Boolean(cluster.spec?.validationPolicy?.skipWorkDirValidate);
  // Service Metadata initial values
  const kvsToString = (kv: Record<string, string> | undefined) =>
    kv ? Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(", ") : "";
  const initialHeadlessServiceAnnotations = kvsToString(
    (cluster.spec?.headlessService as Record<string, Record<string, Record<string, string>>> | undefined)
      ?.metadata?.annotations,
  );
  const initialHeadlessServiceLabels = kvsToString(
    (cluster.spec?.headlessService as Record<string, Record<string, Record<string, string>>> | undefined)
      ?.metadata?.labels,
  );
  const initialPodServiceAnnotations = kvsToString(
    (cluster.spec?.podService as Record<string, Record<string, Record<string, string>>> | undefined)
      ?.metadata?.annotations,
  );
  const initialPodServiceLabels = kvsToString(
    (cluster.spec?.podService as Record<string, Record<string, Record<string, string>>> | undefined)
      ?.metadata?.labels,
  );
  const initialAerospikeConfig = useMemo(
    () => cluster.spec?.aerospikeConfig ?? {},
    [cluster.spec?.aerospikeConfig],
  );
  const initialAerospikeConfigText = useMemo(
    () => JSON.stringify(initialAerospikeConfig, null, 2),
    [initialAerospikeConfig],
  );

  // Reset form state when the dialog opens
  useEffect(() => {
    if (open) {
      setImage(initialImage);
      setSize(initialSize);
      setEnableDynamicConfig(initialEnableDynamicConfig);
      setAerospikeConfigText(initialAerospikeConfigText);
      setBatchSize(initialBatchSize);
      setMaxUnavailable(initialMaxUnavailable);
      setDisablePDB(initialDisablePDB);
      setAccessType(initialAccessType);
      setFabricType(initialFabricType);
      setAlternateAccessType(initialAlternateAccessType);
      setCustomAccessNames(initialCustomAccessNames);
      setCustomAltAccessNames(initialCustomAltAccessNames);
      setCustomFabricNames(initialCustomFabricNames);
      setNetworkPolicyConfig(initialNetworkPolicyConfig);
      setNodeBlockList(initialNodeBlockList);
      setBandwidthIngress(initialBandwidthIngress);
      setBandwidthEgress(initialBandwidthEgress);
      setReadinessGateEnabled(initialReadinessGateEnabled);
      setPodMetadataLabels(initialPodMetadataLabels);
      setPodMetadataAnnotations(initialPodMetadataAnnotations);
      setPodManagementPolicy(initialPodManagementPolicy);
      setDnsPolicy(initialDnsPolicy);
      setMonitoringConfig(initialMonitoringConfig);
      setNodeSelector({ ...initialNodeSelector });
      setTolerations(initialTolerations.map((t) => ({ ...t })));
      setMultiPodPerHost(initialMultiPodPerHost);
      setHostNetwork(initialHostNetwork);
      setServiceAccountName(initialServiceAccountName);
      setTerminationGracePeriod(initialTerminationGracePeriod);
      setImagePullSecrets([...initialImagePullSecrets]);
      setSkipWorkDirValidate(initialSkipWorkDirValidate);
      setHeadlessServiceAnnotations(initialHeadlessServiceAnnotations);
      setHeadlessServiceLabels(initialHeadlessServiceLabels);
      setPodServiceAnnotations(initialPodServiceAnnotations);
      setPodServiceLabels(initialPodServiceLabels);
      setError(null);
      setConfigError(null);
    }
  }, [
    open,
    initialImage,
    initialSize,
    initialEnableDynamicConfig,
    initialAerospikeConfigText,
    initialBatchSize,
    initialMaxUnavailable,
    initialDisablePDB,
    initialAccessType,
    initialFabricType,
    initialAlternateAccessType,
    initialCustomAccessNames,
    initialCustomAltAccessNames,
    initialCustomFabricNames,
    initialNetworkPolicyConfig,
    initialNodeBlockList,
    initialBandwidthIngress,
    initialBandwidthEgress,
    initialReadinessGateEnabled,
    initialPodMetadataLabels,
    initialPodMetadataAnnotations,
    initialPodManagementPolicy,
    initialDnsPolicy,
    initialMonitoringConfig,
    initialNodeSelector,
    initialTolerations,
    initialMultiPodPerHost,
    initialHostNetwork,
    initialServiceAccountName,
    initialTerminationGracePeriod,
    initialImagePullSecrets,
    initialSkipWorkDirValidate,
    initialHeadlessServiceAnnotations,
    initialHeadlessServiceLabels,
    initialPodServiceAnnotations,
    initialPodServiceLabels,
  ]);

  // Validate JSON on every keystroke
  useEffect(() => {
    if (!aerospikeConfigText.trim()) {
      setConfigError(null);
      return;
    }
    try {
      JSON.parse(aerospikeConfigText);
      setConfigError(null);
    } catch {
      setConfigError("Invalid JSON");
    }
  }, [aerospikeConfigText]);

  const hasChanges =
    image !== initialImage ||
    size !== initialSize ||
    enableDynamicConfig !== initialEnableDynamicConfig ||
    aerospikeConfigText !== initialAerospikeConfigText ||
    batchSize !== initialBatchSize ||
    maxUnavailable !== initialMaxUnavailable ||
    disablePDB !== initialDisablePDB ||
    accessType !== initialAccessType ||
    fabricType !== initialFabricType ||
    alternateAccessType !== initialAlternateAccessType ||
    customAccessNames !== initialCustomAccessNames ||
    customAltAccessNames !== initialCustomAltAccessNames ||
    customFabricNames !== initialCustomFabricNames ||
    JSON.stringify(networkPolicyConfig) !== JSON.stringify(initialNetworkPolicyConfig) ||
    nodeBlockList !== initialNodeBlockList ||
    bandwidthIngress !== initialBandwidthIngress ||
    bandwidthEgress !== initialBandwidthEgress ||
    readinessGateEnabled !== initialReadinessGateEnabled ||
    podMetadataLabels !== initialPodMetadataLabels ||
    podMetadataAnnotations !== initialPodMetadataAnnotations ||
    podManagementPolicy !== initialPodManagementPolicy ||
    dnsPolicy !== initialDnsPolicy ||
    JSON.stringify(monitoringConfig) !== JSON.stringify(initialMonitoringConfig) ||
    JSON.stringify(nodeSelector) !== JSON.stringify(initialNodeSelector) ||
    JSON.stringify(tolerations) !== JSON.stringify(initialTolerations) ||
    multiPodPerHost !== initialMultiPodPerHost ||
    hostNetwork !== initialHostNetwork ||
    serviceAccountName !== initialServiceAccountName ||
    terminationGracePeriod !== initialTerminationGracePeriod ||
    JSON.stringify(imagePullSecrets) !== JSON.stringify(initialImagePullSecrets) ||
    skipWorkDirValidate !== initialSkipWorkDirValidate ||
    headlessServiceAnnotations !== initialHeadlessServiceAnnotations ||
    headlessServiceLabels !== initialHeadlessServiceLabels ||
    podServiceAnnotations !== initialPodServiceAnnotations ||
    podServiceLabels !== initialPodServiceLabels;

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: UpdateK8sClusterRequest = {};

      if (size !== initialSize) {
        data.size = size;
      }
      if (image !== initialImage) {
        data.image = image;
      }
      if (enableDynamicConfig !== initialEnableDynamicConfig) {
        data.enableDynamicConfig = enableDynamicConfig;
      }
      if (aerospikeConfigText !== initialAerospikeConfigText) {
        const parsed = JSON.parse(aerospikeConfigText) as Record<string, unknown>;
        data.aerospikeConfig = parsed;
      }
      if (batchSize !== initialBatchSize && batchSize !== undefined) {
        data.rollingUpdateBatchSize = batchSize;
      }
      if (maxUnavailable !== initialMaxUnavailable && maxUnavailable !== "") {
        data.maxUnavailable = maxUnavailable;
      }
      if (disablePDB !== initialDisablePDB) {
        data.disablePDB = disablePDB;
      }
      if (
        accessType !== initialAccessType ||
        fabricType !== initialFabricType ||
        alternateAccessType !== initialAlternateAccessType ||
        customAccessNames !== initialCustomAccessNames ||
        customAltAccessNames !== initialCustomAltAccessNames ||
        customFabricNames !== initialCustomFabricNames
      ) {
        const parseNames = (s: string) => {
          const names = s
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          return names.length > 0 ? names : undefined;
        };
        data.networkPolicy = {
          accessType,
          ...(fabricType ? { fabricType: fabricType as NetworkAccessType } : {}),
          ...(alternateAccessType
            ? { alternateAccessType: alternateAccessType as NetworkAccessType }
            : {}),
          ...(accessType === "configuredIP"
            ? { customAccessNetworkNames: parseNames(customAccessNames) }
            : {}),
          ...(alternateAccessType === "configuredIP"
            ? { customAlternateAccessNetworkNames: parseNames(customAltAccessNames) }
            : {}),
          ...(fabricType === "configuredIP"
            ? { customFabricNetworkNames: parseNames(customFabricNames) }
            : {}),
        };
      }
      if (JSON.stringify(networkPolicyConfig) !== JSON.stringify(initialNetworkPolicyConfig)) {
        data.networkPolicyConfig = networkPolicyConfig ?? undefined;
      }
      if (nodeBlockList !== initialNodeBlockList) {
        const nodes = nodeBlockList
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        data.k8sNodeBlockList = nodes;
      }

      if (
        bandwidthIngress !== initialBandwidthIngress ||
        bandwidthEgress !== initialBandwidthEgress
      ) {
        const bw: BandwidthConfig = {};
        if (bandwidthIngress.trim()) bw.ingress = bandwidthIngress.trim();
        if (bandwidthEgress.trim()) bw.egress = bandwidthEgress.trim();
        data.bandwidthConfig = Object.keys(bw).length > 0 ? bw : undefined;
      }

      // Pod scheduling fields (all combined into one podScheduling object)
      const podSchedulingChanged =
        readinessGateEnabled !== initialReadinessGateEnabled ||
        podManagementPolicy !== initialPodManagementPolicy ||
        dnsPolicy !== initialDnsPolicy ||
        JSON.stringify(nodeSelector) !== JSON.stringify(initialNodeSelector) ||
        JSON.stringify(tolerations) !== JSON.stringify(initialTolerations) ||
        multiPodPerHost !== initialMultiPodPerHost ||
        hostNetwork !== initialHostNetwork ||
        serviceAccountName !== initialServiceAccountName ||
        terminationGracePeriod !== initialTerminationGracePeriod ||
        JSON.stringify(imagePullSecrets) !== JSON.stringify(initialImagePullSecrets);
      if (podSchedulingChanged) {
        data.podScheduling = {
          ...data.podScheduling,
          readinessGateEnabled: readinessGateEnabled || undefined,
          podManagementPolicy:
            podManagementPolicy === ""
              ? undefined
              : (podManagementPolicy as "OrderedReady" | "Parallel"),
          dnsPolicy: dnsPolicy || undefined,
          nodeSelector: Object.keys(nodeSelector).length > 0 ? nodeSelector : undefined,
          tolerations: tolerations.length > 0 ? tolerations : undefined,
          multiPodPerHost: multiPodPerHost || undefined,
          hostNetwork: hostNetwork || undefined,
          serviceAccountName: serviceAccountName || undefined,
          terminationGracePeriodSeconds: terminationGracePeriod,
          imagePullSecrets: imagePullSecrets.length > 0 ? imagePullSecrets : undefined,
        };
      }

      // Pod metadata
      const podMetaChanged =
        podMetadataLabels !== initialPodMetadataLabels ||
        podMetadataAnnotations !== initialPodMetadataAnnotations;
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
          labels: parseKvPairs(podMetadataLabels),
          annotations: parseKvPairs(podMetadataAnnotations),
        };
      }

      // Monitoring
      if (JSON.stringify(monitoringConfig) !== JSON.stringify(initialMonitoringConfig)) {
        data.monitoring = monitoringConfig ?? undefined;
      }

      // Validation Policy
      if (skipWorkDirValidate !== initialSkipWorkDirValidate) {
        data.validationPolicy = skipWorkDirValidate ? { skipWorkDirValidate: true } : undefined;
      }

      // Service Metadata
      const parseKvString = (s: string): Record<string, string> | undefined => {
        const entries = s.split(",").map((e) => e.trim()).filter(Boolean);
        const result: Record<string, string> = {};
        for (const entry of entries) {
          const eqIdx = entry.indexOf("=");
          if (eqIdx > 0) {
            result[entry.slice(0, eqIdx).trim()] = entry.slice(eqIdx + 1).trim();
          }
        }
        return Object.keys(result).length > 0 ? result : undefined;
      };
      if (
        headlessServiceAnnotations !== initialHeadlessServiceAnnotations ||
        headlessServiceLabels !== initialHeadlessServiceLabels
      ) {
        const annotations = parseKvString(headlessServiceAnnotations);
        const labels = parseKvString(headlessServiceLabels);
        data.headlessService = annotations || labels ? { annotations, labels } : undefined;
      }
      if (
        podServiceAnnotations !== initialPodServiceAnnotations ||
        podServiceLabels !== initialPodServiceLabels
      ) {
        const annotations = parseKvString(podServiceAnnotations);
        const labels = parseKvString(podServiceLabels);
        data.podService = annotations || labels ? { annotations, labels } : undefined;
      }

      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
              value={image}
              onChange={(e) => {
                setImage(e.target.value);
                setError(null);
              }}
              placeholder="aerospike:ce-8.1.1.1"
              disabled={loading}
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
              value={size}
              onChange={(e) => {
                setSize(Math.min(8, Math.max(1, parseInt(e.target.value) || 1)));
                setError(null);
              }}
              disabled={loading}
            />
            {size < initialSize && (
              <p className="text-warning text-sm">
                Scaling down will remove nodes. Data may be lost if not replicated.
              </p>
            )}
          </div>

          {/* Enable Dynamic Config */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-dynamic-config"
              checked={enableDynamicConfig}
              onCheckedChange={(checked) => {
                setEnableDynamicConfig(checked === true);
                setError(null);
              }}
              disabled={loading}
            />
            <Label htmlFor="edit-dynamic-config" className="cursor-pointer">
              Enable Dynamic Config Update
            </Label>
          </div>

          {/* Monitoring */}
          <EditMonitoringSection
            config={monitoringConfig}
            onChange={(cfg) => {
              setMonitoringConfig(cfg);
              setError(null);
            }}
            disabled={loading}
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
                  value={batchSize ?? ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setBatchSize(isNaN(val) ? undefined : Math.max(1, val));
                    setError(null);
                  }}
                  placeholder="e.g. 1"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-max-unavailable" className="text-xs">
                  Max Unavailable
                </Label>
                <Input
                  id="edit-max-unavailable"
                  value={maxUnavailable}
                  onChange={(e) => {
                    setMaxUnavailable(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 1 or 25%"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-disable-pdb"
                checked={disablePDB}
                onCheckedChange={(checked) => {
                  setDisablePDB(checked === true);
                  setError(null);
                }}
                disabled={loading}
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
                  value={accessType}
                  onValueChange={(v) => {
                    setAccessType(v as NetworkAccessType);
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-access-type" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                    <SelectItem value="configuredIP">Configured IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-fabric-type" className="text-xs">
                  Fabric Type
                </Label>
                <Select
                  value={fabricType || "default"}
                  onValueChange={(v) => {
                    setFabricType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-fabric-type" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (same as access)</SelectItem>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-alt-access" className="text-xs">
                  Alternate Access
                </Label>
                <Select
                  value={alternateAccessType || "default"}
                  onValueChange={(v) => {
                    setAlternateAccessType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-alt-access" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">None</SelectItem>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                    <SelectItem value="configuredIP">Configured IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Custom Network Names (shown when configuredIP is selected) */}
          {(accessType === "configuredIP" ||
            alternateAccessType === "configuredIP" ||
            fabricType === "configuredIP") && (
            <div className="grid gap-2 rounded border border-amber-200 p-3 dark:border-amber-800">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Custom network names required for configuredIP
              </span>
              {accessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-access" className="text-xs">
                    Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-access"
                    value={customAccessNames}
                    onChange={(e) => setCustomAccessNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
                  />
                </div>
              )}
              {alternateAccessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-alt-access" className="text-xs">
                    Alternate Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-alt-access"
                    value={customAltAccessNames}
                    onChange={(e) => setCustomAltAccessNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
                  />
                </div>
              )}
              {fabricType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-fabric" className="text-xs">
                    Fabric Network Names
                  </Label>
                  <Input
                    id="edit-custom-fabric"
                    value={customFabricNames}
                    onChange={(e) => setCustomFabricNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
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
                checked={networkPolicyConfig?.enabled ?? false}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setNetworkPolicyConfig({ enabled: true, type: "kubernetes" });
                  } else {
                    setNetworkPolicyConfig(null);
                  }
                  setError(null);
                }}
                disabled={loading}
              />
              <Label htmlFor="edit-netpol-auto" className="cursor-pointer text-xs">
                Auto-generate K8s NetworkPolicy
              </Label>
            </div>
            {networkPolicyConfig?.enabled && (
              <Select
                value={networkPolicyConfig.type}
                onValueChange={(v) => {
                  setNetworkPolicyConfig({
                    enabled: true,
                    type: v as "kubernetes" | "cilium",
                  });
                  setError(null);
                }}
              >
                <SelectTrigger disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kubernetes">Kubernetes (standard)</SelectItem>
                  <SelectItem value="cilium">Cilium</SelectItem>
                </SelectContent>
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
              value={nodeBlockList}
              onChange={(e) => {
                setNodeBlockList(e.target.value);
                setError(null);
              }}
              placeholder="node1, node2"
              disabled={loading}
            />
            <p className="text-muted-foreground text-[10px]">
              Comma-separated K8s node names to exclude from scheduling
            </p>
          </div>

          {/* Bandwidth Limits */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Bandwidth Limits</Label>
            <p className="text-muted-foreground text-[10px]">
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
                  value={bandwidthIngress}
                  onChange={(e) => {
                    setBandwidthIngress(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 10M"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-bw-egress" className="text-xs">
                  Egress
                </Label>
                <Input
                  id="edit-bw-egress"
                  value={bandwidthEgress}
                  onChange={(e) => {
                    setBandwidthEgress(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 10M"
                  disabled={loading}
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
                checked={readinessGateEnabled}
                onCheckedChange={(checked) => {
                  setReadinessGateEnabled(checked === true);
                  setError(null);
                }}
                disabled={loading}
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
                  value={podManagementPolicy || "default"}
                  onValueChange={(v) => {
                    setPodManagementPolicy(v === "default" ? "" : v);
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-pod-mgmt-policy" disabled={loading}>
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
                <Label htmlFor="edit-dns-policy" className="text-xs">
                  DNS Policy
                </Label>
                <Select
                  value={dnsPolicy || "default"}
                  onValueChange={(v) => {
                    setDnsPolicy(v === "default" ? "" : v);
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-dns-policy" disabled={loading}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Pod Labels (key=value, ...)</Label>
                <Input
                  value={podMetadataLabels}
                  onChange={(e) => {
                    setPodMetadataLabels(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. app=aerospike, team=data"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Pod Annotations (key=value, ...)</Label>
                <Input
                  value={podMetadataAnnotations}
                  onChange={(e) => {
                    setPodMetadataAnnotations(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. prometheus.io/scrape=true"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Pod Scheduling */}
          <EditPodSchedulingSection
            nodeSelector={nodeSelector}
            onNodeSelectorChange={(v) => {
              setNodeSelector(v);
              setError(null);
            }}
            tolerations={tolerations}
            onTolerationsChange={(v) => {
              setTolerations(v);
              setError(null);
            }}
            multiPodPerHost={multiPodPerHost}
            onMultiPodPerHostChange={(v) => {
              setMultiPodPerHost(v);
              setError(null);
            }}
            hostNetwork={hostNetwork}
            onHostNetworkChange={(v) => {
              setHostNetwork(v);
              setError(null);
            }}
            serviceAccountName={serviceAccountName}
            onServiceAccountNameChange={(v) => {
              setServiceAccountName(v);
              setError(null);
            }}
            terminationGracePeriod={terminationGracePeriod}
            onTerminationGracePeriodChange={(v) => {
              setTerminationGracePeriod(v);
              setError(null);
            }}
            imagePullSecrets={imagePullSecrets}
            onImagePullSecretsChange={(v) => {
              setImagePullSecrets(v);
              setError(null);
            }}
            disabled={loading}
          />

          {/* Validation Policy */}
          <EditCollapsible
            title="Validation Policy"
            summary={skipWorkDirValidate ? "Skip WorkDir Validate" : "Default"}
          >
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="edit-skip-workdir" className="cursor-pointer text-xs">
                  Skip Work Dir Validate
                </Label>
                <p className="text-muted-foreground text-[10px]">
                  Skip validation of the working directory on pod startup.
                </p>
              </div>
              <Switch
                id="edit-skip-workdir"
                checked={skipWorkDirValidate}
                onCheckedChange={(checked) => {
                  setSkipWorkDirValidate(checked);
                  setError(null);
                }}
                disabled={loading}
              />
            </div>
          </EditCollapsible>

          {/* Service Metadata */}
          <EditCollapsible
            title="Service Metadata"
            summary={
              [
                headlessServiceAnnotations ? "Headless annotations" : null,
                headlessServiceLabels ? "Headless labels" : null,
                podServiceAnnotations ? "Pod annotations" : null,
                podServiceLabels ? "Pod labels" : null,
              ]
                .filter(Boolean)
                .join(", ") || "None"
            }
          >
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-xs font-semibold">Headless Service</Label>
                <div className="grid gap-1">
                  <Label htmlFor="edit-headless-annotations" className="text-[10px]">
                    Annotations (key=value, comma-separated)
                  </Label>
                  <Input
                    id="edit-headless-annotations"
                    value={headlessServiceAnnotations}
                    onChange={(e) => {
                      setHeadlessServiceAnnotations(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. service.beta.kubernetes.io/aws-load-balancer-type=nlb"
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="edit-headless-labels" className="text-[10px]">
                    Labels (key=value, comma-separated)
                  </Label>
                  <Input
                    id="edit-headless-labels"
                    value={headlessServiceLabels}
                    onChange={(e) => {
                      setHeadlessServiceLabels(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. app.kubernetes.io/component=aerospike"
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-xs font-semibold">Pod Service</Label>
                <div className="grid gap-1">
                  <Label htmlFor="edit-pod-annotations" className="text-[10px]">
                    Annotations (key=value, comma-separated)
                  </Label>
                  <Input
                    id="edit-pod-annotations"
                    value={podServiceAnnotations}
                    onChange={(e) => {
                      setPodServiceAnnotations(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. service.beta.kubernetes.io/aws-load-balancer-type=nlb"
                    disabled={loading}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="edit-pod-labels" className="text-[10px]">
                    Labels (key=value, comma-separated)
                  </Label>
                  <Input
                    id="edit-pod-labels"
                    value={podServiceLabels}
                    onChange={(e) => {
                      setPodServiceLabels(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. app.kubernetes.io/component=aerospike"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </EditCollapsible>

          {/* Aerospike Config */}
          <div className="grid gap-2">
            <Label htmlFor="edit-aerospike-config">Aerospike Config (JSON)</Label>
            <Textarea
              id="edit-aerospike-config"
              value={aerospikeConfigText}
              onChange={(e) => {
                setAerospikeConfigText(e.target.value);
                setError(null);
              }}
              rows={12}
              className="font-mono text-xs"
              placeholder='{"service": {...}, "network": {...}, "namespaces": [...]}'
              disabled={loading}
            />
            {configError && <p className="text-destructive text-sm">{configError}</p>}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSave}
            loading={loading}
            disabled={!hasChanges || loading || !!configError}
          >
            Save Changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Monitoring Section for Edit Dialog
// ---------------------------------------------------------------------------

/** Custom Prometheus rule groups JSON editor for edit dialog. */
function EditCustomRulesEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, unknown>[] | undefined;
  onChange: (v: Record<string, unknown>[] | undefined) => void;
  disabled?: boolean;
}) {
  const [rawText, setRawText] = useState(() =>
    value ? JSON.stringify(value, null, 2) : "",
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setParseError(null);
      onChange(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setParseError("Must be a JSON array of rule groups");
        return;
      }
      setParseError(null);
      onChange(parsed);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  return (
    <div className="space-y-1">
      <Textarea
        value={rawText}
        onChange={(e) => handleChange(e.target.value)}
        rows={6}
        className="font-mono text-xs"
        disabled={disabled}
        placeholder={`[\n  {\n    "name": "aerospike-alerts",\n    "rules": [...]\n  }\n]`}
      />
      {parseError && <p className="text-xs text-red-500">{parseError}</p>}
    </div>
  );
}

/** Inline key-value pair editor for Record<string, string> fields. */
function EditKvEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  disabled,
}: {
  value: Record<string, string> | undefined;
  onChange: (v: Record<string, string> | undefined) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}) {
  const entries = value ? Object.entries(value) : [];
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const addEntry = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (!k) return;
    onChange({ ...value, [k]: v });
    setNewKey("");
    setNewVal("");
  };

  const removeEntry = (key: string) => {
    if (!value) return;
    const next = { ...value };
    delete next[key];
    onChange(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5">
          <code className="bg-muted truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
          <span className="text-muted-foreground text-[10px]">=</span>
          <code className="bg-muted flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">{v}</code>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => removeEntry(k)}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          className="h-7 text-[10px]"
          placeholder={keyPlaceholder}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
          disabled={disabled}
        />
        <Input
          className="h-7 text-[10px]"
          placeholder={valuePlaceholder}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEntry())}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-[10px]"
          onClick={addEntry}
          disabled={disabled || !newKey.trim()}
        >
          <Plus className="mr-0.5 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

function EditCollapsible({
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
    <div className="rounded border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div>
          <span className="text-xs font-medium">{title}</span>
          <span className="text-muted-foreground ml-1.5 text-[10px]">{summary}</span>
        </div>
        {open ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
        )}
      </button>
      {open && <div className="space-y-3 border-t px-3 pt-3 pb-3">{children}</div>}
    </div>
  );
}

function EditMonitoringSection({
  config,
  onChange,
  disabled,
}: {
  config: MonitoringConfig | null;
  onChange: (cfg: MonitoringConfig | null) => void;
  disabled?: boolean;
}) {
  const enabled = config?.enabled ?? false;

  const patch = (updates: Partial<MonitoringConfig>) => {
    onChange({ ...config!, ...updates });
  };

  return (
    <div className="grid gap-3">
      <Label className="text-sm font-semibold">Monitoring</Label>
      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-monitoring-enabled"
          checked={enabled}
          onCheckedChange={(checked) => {
            if (checked === true) {
              onChange({ enabled: true, port: config?.port ?? 9145 });
            } else {
              onChange(null);
            }
          }}
          disabled={disabled}
        />
        <Label htmlFor="edit-monitoring-enabled" className="cursor-pointer text-xs">
          Enable Prometheus monitoring
        </Label>
      </div>

      {enabled && config && (
        <div className="space-y-3">
          {/* Port & Image */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="edit-monitoring-port" className="text-xs">
                Exporter Port
              </Label>
              <Input
                id="edit-monitoring-port"
                type="number"
                min={1024}
                max={65535}
                value={config.port}
                onChange={(e) =>
                  patch({
                    port: Math.min(65535, Math.max(1024, parseInt(e.target.value) || 9145)),
                  })
                }
                disabled={disabled}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-exporter-image" className="text-xs">
                Exporter Image
              </Label>
              <Input
                id="edit-exporter-image"
                value={config.exporterImage ?? ""}
                onChange={(e) => patch({ exporterImage: e.target.value || undefined })}
                placeholder="aerospike/aerospike-prometheus-exporter:latest"
                disabled={disabled}
              />
            </div>
          </div>

          {/* Metric Labels */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Metric Labels</Label>
            <EditKvEditor
              value={config.metricLabels}
              onChange={(labels) => patch({ metricLabels: labels })}
              keyPlaceholder="label name"
              valuePlaceholder="label value"
              disabled={disabled}
            />
          </div>

          {/* Exporter Resources */}
          <EditCollapsible
            title="Exporter Resources"
            summary={
              config.resources
                ? `${config.resources.requests.cpu} / ${config.resources.requests.memory}`
                : "Defaults"
            }
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-exporter-resources-enabled"
                  checked={config.resources != null}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        resources: {
                          requests: { cpu: "100m", memory: "128Mi" },
                          limits: { cpu: "200m", memory: "256Mi" },
                        },
                      });
                    } else {
                      patch({ resources: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-exporter-resources-enabled" className="cursor-pointer text-xs">
                  Set resource requests/limits
                </Label>
              </div>
              {config.resources && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">CPU Request</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.requests.cpu}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              requests: { ...config.resources!.requests, cpu: e.target.value },
                            },
                          })
                        }
                        placeholder="100m"
                        disabled={disabled}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Memory Request</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.requests.memory}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              requests: { ...config.resources!.requests, memory: e.target.value },
                            },
                          })
                        }
                        placeholder="128Mi"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">CPU Limit</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.limits.cpu}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              limits: { ...config.resources!.limits, cpu: e.target.value },
                            },
                          })
                        }
                        placeholder="200m"
                        disabled={disabled}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Memory Limit</Label>
                      <Input
                        className="h-7 text-xs"
                        value={config.resources.limits.memory}
                        onChange={(e) =>
                          patch({
                            resources: {
                              ...config.resources!,
                              limits: { ...config.resources!.limits, memory: e.target.value },
                            },
                          })
                        }
                        placeholder="256Mi"
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </EditCollapsible>

          {/* ServiceMonitor */}
          <EditCollapsible
            title="ServiceMonitor"
            summary={config.serviceMonitor?.enabled ? "Enabled" : "Disabled"}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-sm-enabled"
                  checked={config.serviceMonitor?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        serviceMonitor: {
                          enabled: true,
                          ...(config.serviceMonitor ?? {}),
                        },
                      });
                    } else {
                      patch({ serviceMonitor: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-sm-enabled" className="cursor-pointer text-xs">
                  Enable ServiceMonitor
                </Label>
              </div>
              {config.serviceMonitor?.enabled && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Scrape Interval</Label>
                    <Input
                      className="h-7 max-w-[150px] text-xs"
                      value={config.serviceMonitor.interval ?? ""}
                      onChange={(e) =>
                        patch({
                          serviceMonitor: {
                            ...config.serviceMonitor!,
                            interval: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="30s"
                      disabled={disabled}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Labels</Label>
                    <EditKvEditor
                      value={config.serviceMonitor.labels}
                      onChange={(labels) =>
                        patch({
                          serviceMonitor: { ...config.serviceMonitor!, labels },
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                </>
              )}
            </div>
          </EditCollapsible>

          {/* PrometheusRule */}
          <EditCollapsible
            title="PrometheusRule"
            summary={config.prometheusRule?.enabled ? "Enabled" : "Disabled"}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-prom-rule-enabled"
                  checked={config.prometheusRule?.enabled ?? false}
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      patch({
                        prometheusRule: {
                          enabled: true,
                          ...(config.prometheusRule ?? {}),
                        },
                      });
                    } else {
                      patch({ prometheusRule: undefined });
                    }
                  }}
                  disabled={disabled}
                />
                <Label htmlFor="edit-prom-rule-enabled" className="cursor-pointer text-xs">
                  Enable PrometheusRule
                </Label>
              </div>
              {config.prometheusRule?.enabled && (
                <>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Labels</Label>
                    <EditKvEditor
                      value={config.prometheusRule.labels}
                      onChange={(labels) =>
                        patch({
                          prometheusRule: { ...config.prometheusRule!, labels },
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Custom Rule Groups (JSON)</Label>
                    <p className="text-muted-foreground text-[10px]">
                      Define custom Prometheus alerting/recording rule groups as a JSON array.
                    </p>
                    <EditCustomRulesEditor
                      value={config.prometheusRule.customRules}
                      onChange={(customRules) =>
                        patch({
                          prometheusRule: { ...config.prometheusRule!, customRules },
                        })
                      }
                      disabled={disabled}
                    />
                  </div>
                </>
              )}
            </div>
          </EditCollapsible>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pod Scheduling Section for Edit Dialog
// ---------------------------------------------------------------------------

function EditPodSchedulingSection({
  nodeSelector,
  onNodeSelectorChange,
  tolerations,
  onTolerationsChange,
  multiPodPerHost,
  onMultiPodPerHostChange,
  hostNetwork,
  onHostNetworkChange,
  serviceAccountName,
  onServiceAccountNameChange,
  terminationGracePeriod,
  onTerminationGracePeriodChange,
  imagePullSecrets,
  onImagePullSecretsChange,
  disabled,
}: {
  nodeSelector: Record<string, string>;
  onNodeSelectorChange: (v: Record<string, string>) => void;
  tolerations: TolerationConfig[];
  onTolerationsChange: (v: TolerationConfig[]) => void;
  multiPodPerHost: boolean;
  onMultiPodPerHostChange: (v: boolean) => void;
  hostNetwork: boolean;
  onHostNetworkChange: (v: boolean) => void;
  serviceAccountName: string;
  onServiceAccountNameChange: (v: string) => void;
  terminationGracePeriod: number | undefined;
  onTerminationGracePeriodChange: (v: number | undefined) => void;
  imagePullSecrets: string[];
  onImagePullSecretsChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [nsSelectorKey, setNsSelectorKey] = useState("");
  const [nsSelectorValue, setNsSelectorValue] = useState("");
  const [newSecret, setNewSecret] = useState("");

  const addNodeSelector = () => {
    const k = nsSelectorKey.trim();
    const v = nsSelectorValue.trim();
    if (!k || !v) return;
    onNodeSelectorChange({ ...nodeSelector, [k]: v });
    setNsSelectorKey("");
    setNsSelectorValue("");
  };

  const removeNodeSelector = (key: string) => {
    const next = { ...nodeSelector };
    delete next[key];
    onNodeSelectorChange(next);
  };

  const addToleration = () => {
    onTolerationsChange([
      ...tolerations,
      { key: "", operator: "Equal", value: "", effect: "NoSchedule" },
    ]);
  };

  const updateToleration = (index: number, updates: Partial<TolerationConfig>) => {
    const next = [...tolerations];
    next[index] = { ...next[index], ...updates };
    onTolerationsChange(next);
  };

  const removeToleration = (index: number) => {
    onTolerationsChange(tolerations.filter((_, i) => i !== index));
  };

  const addImagePullSecret = () => {
    const name = newSecret.trim();
    if (!name || imagePullSecrets.includes(name)) return;
    onImagePullSecretsChange([...imagePullSecrets, name]);
    setNewSecret("");
  };

  const removeImagePullSecret = (name: string) => {
    onImagePullSecretsChange(imagePullSecrets.filter((s) => s !== name));
  };

  const selectorCount = Object.keys(nodeSelector).length;
  const summary =
    [
      selectorCount > 0 ? `${selectorCount} selector(s)` : null,
      tolerations.length > 0 ? `${tolerations.length} toleration(s)` : null,
      multiPodPerHost ? "Multi-Pod" : null,
      hostNetwork ? "Host Network" : null,
      serviceAccountName ? "SA" : null,
      imagePullSecrets.length > 0 ? `${imagePullSecrets.length} pull secret(s)` : null,
      terminationGracePeriod != null ? `Grace: ${terminationGracePeriod}s` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Default";

  return (
    <EditCollapsible title="Pod Scheduling" summary={summary}>
      <div className="space-y-4">
        {/* Node Selector */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Node Selector</Label>
          <p className="text-muted-foreground text-[10px]">
            Constrain pods to nodes with matching labels.
          </p>
          {selectorCount > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(nodeSelector).map(([k, v]) => (
                <span
                  key={k}
                  className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {k}={v}
                  <button
                    type="button"
                    onClick={() => removeNodeSelector(k)}
                    disabled={disabled}
                    className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                    title={`Remove ${k}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={nsSelectorKey}
              onChange={(e) => setNsSelectorKey(e.target.value)}
              placeholder="Key"
              className="h-7 flex-1 text-xs"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNodeSelector();
                }
              }}
            />
            <Input
              value={nsSelectorValue}
              onChange={(e) => setNsSelectorValue(e.target.value)}
              placeholder="Value"
              className="h-7 flex-1 text-xs"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNodeSelector();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[10px]"
              onClick={addNodeSelector}
              disabled={disabled || !nsSelectorKey.trim() || !nsSelectorValue.trim()}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>

        {/* Tolerations */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Tolerations</Label>
          <p className="text-muted-foreground text-[10px]">
            Allow pods to be scheduled on nodes with matching taints.
          </p>
          {tolerations.map((tol, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-end gap-2 rounded border p-2"
            >
              <div className="grid gap-1">
                <Label className="text-[10px]">Key</Label>
                <Input
                  value={tol.key ?? ""}
                  onChange={(e) => updateToleration(idx, { key: e.target.value || undefined })}
                  placeholder="e.g. dedicated"
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Operator</Label>
                <Select
                  value={tol.operator ?? "Equal"}
                  onValueChange={(v) =>
                    updateToleration(idx, { operator: v as "Equal" | "Exists" })
                  }
                >
                  <SelectTrigger className="h-7 w-20 text-[10px]" disabled={disabled}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Equal">Equal</SelectItem>
                    <SelectItem value="Exists">Exists</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Value</Label>
                <Input
                  value={tol.value ?? ""}
                  onChange={(e) => updateToleration(idx, { value: e.target.value || undefined })}
                  placeholder={tol.operator === "Exists" ? "(ignored)" : "e.g. aerospike"}
                  disabled={disabled || tol.operator === "Exists"}
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px]">Effect</Label>
                <Select
                  value={tol.effect ?? ""}
                  onValueChange={(v) =>
                    updateToleration(idx, { effect: v as TolerationConfig["effect"] })
                  }
                >
                  <SelectTrigger className="h-7 w-28 text-[10px]" disabled={disabled}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NoSchedule">NoSchedule</SelectItem>
                    <SelectItem value="PreferNoSchedule">PreferNoSchedule</SelectItem>
                    <SelectItem value="NoExecute">NoExecute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => removeToleration(idx)}
                disabled={disabled}
                className="text-muted-foreground hover:text-destructive mb-1 self-end p-1"
                title="Remove toleration"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addToleration}
            disabled={disabled}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Toleration
          </button>
        </div>

        {/* Toggles: Multi Pod Per Host, Host Network */}
        <div className="grid gap-3">
          <Label className="text-xs font-semibold">Pod Placement</Label>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-multi-pod" className="cursor-pointer text-xs">
                Multi Pod Per Host
              </Label>
              <p className="text-muted-foreground text-[10px]">
                Allow multiple Aerospike pods on the same node.
              </p>
            </div>
            <Switch
              id="edit-multi-pod"
              checked={multiPodPerHost}
              onCheckedChange={onMultiPodPerHostChange}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="edit-host-network" className="cursor-pointer text-xs">
                Host Network
              </Label>
              <p className="text-muted-foreground text-[10px]">
                Use the host&apos;s network namespace instead of pod networking.
              </p>
            </div>
            <Switch
              id="edit-host-network"
              checked={hostNetwork}
              onCheckedChange={onHostNetworkChange}
              disabled={disabled}
            />
          </div>
        </div>

        {/* Service Account Name */}
        <div className="grid gap-1">
          <Label htmlFor="edit-service-account" className="text-xs font-semibold">
            Service Account Name
          </Label>
          <Input
            id="edit-service-account"
            value={serviceAccountName}
            onChange={(e) => onServiceAccountNameChange(e.target.value)}
            placeholder="e.g. aerospike-sa"
            className="h-7 text-xs"
            disabled={disabled}
          />
        </div>

        {/* Termination Grace Period */}
        <div className="grid gap-1">
          <Label htmlFor="edit-termination-grace" className="text-xs font-semibold">
            Termination Grace Period (seconds)
          </Label>
          <Input
            id="edit-termination-grace"
            type="number"
            min={0}
            value={terminationGracePeriod ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onTerminationGracePeriodChange(val ? parseInt(val, 10) : undefined);
            }}
            placeholder="e.g. 600 (default: 30)"
            className="h-7 w-40 text-xs"
            disabled={disabled}
          />
        </div>

        {/* Image Pull Secrets */}
        <div className="grid gap-2">
          <Label className="text-xs font-semibold">Image Pull Secrets</Label>
          <p className="text-muted-foreground text-[10px]">
            Kubernetes secrets for pulling images from private registries.
          </p>
          {imagePullSecrets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {imagePullSecrets.map((secret) => (
                <span
                  key={secret}
                  className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                >
                  {secret}
                  <button
                    type="button"
                    onClick={() => removeImagePullSecret(secret)}
                    disabled={disabled}
                    className="hover:bg-accent/20 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full"
                    title={`Remove ${secret}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              placeholder="e.g. my-registry-secret"
              className="h-7 flex-1 text-xs"
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addImagePullSecret();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-[10px]"
              onClick={addImagePullSecret}
              disabled={disabled || !newSecret.trim()}
            >
              <Plus className="mr-0.5 h-3 w-3" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </EditCollapsible>
  );
}

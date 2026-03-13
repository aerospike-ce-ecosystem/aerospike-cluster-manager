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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
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
  SidecarConfig,
  ServiceMetadataConfig,
  StorageSpec,
  VolumeSpec,
  VolumeSourceType,
  VolumeInitMethod,
  VolumeWipeMethod,
  TopologySpreadConstraintConfig,
  PodSecurityContextConfig,
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
  // Topology Spread Constraints
  const [topologySpreadConstraints, setTopologySpreadConstraints] = useState<
    TopologySpreadConstraintConfig[]
  >([]);
  // Pod Security Context
  const [podSecurityRunAsUser, setPodSecurityRunAsUser] = useState<number | undefined>(undefined);
  const [podSecurityRunAsGroup, setPodSecurityRunAsGroup] = useState<number | undefined>(undefined);
  const [podSecurityRunAsNonRoot, setPodSecurityRunAsNonRoot] = useState(false);
  const [podSecurityFsGroup, setPodSecurityFsGroup] = useState<number | undefined>(undefined);
  const [podSecuritySupGroups, setPodSecuritySupGroups] = useState<number[]>([]);
  // Validation Policy
  const [skipWorkDirValidate, setSkipWorkDirValidate] = useState(false);
  // Sidecars & Init Containers
  const [sidecars, setSidecars] = useState<SidecarConfig[]>([]);
  const [initContainers, setInitContainers] = useState<SidecarConfig[]>([]);
  // Service Metadata
  const [podServiceConfig, setPodServiceConfig] = useState<ServiceMetadataConfig | null>(null);
  const [headlessServiceConfig, setHeadlessServiceConfig] = useState<ServiceMetadataConfig | null>(
    null,
  );
  // Rack ID Override
  const [enableRackIDOverride, setEnableRackIDOverride] = useState(false);
  // Storage (multi-volume)
  const [storageVolumes, setStorageVolumes] = useState<VolumeSpec[]>([]);
  const [storageCleanupThreads, setStorageCleanupThreads] = useState<number | undefined>(undefined);
  const [storageDeleteLocalOnRestart, setStorageDeleteLocalOnRestart] = useState(false);
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
  // Topology Spread Constraints initial values
  const initialTopologySpreadConstraints: TopologySpreadConstraintConfig[] =
    specPodScheduling?.topologySpreadConstraints ??
    (specPodSpec?.topologySpreadConstraints as TopologySpreadConstraintConfig[] | undefined) ??
    [];
  // Pod Security Context initial values
  const specSecCtx =
    specPodScheduling?.podSecurityContext ??
    (specPodSpec?.securityContext as PodSecurityContextConfig | undefined);
  const initialPodSecurityRunAsUser = specSecCtx?.runAsUser;
  const initialPodSecurityRunAsGroup = specSecCtx?.runAsGroup;
  const initialPodSecurityRunAsNonRoot = Boolean(specSecCtx?.runAsNonRoot);
  const initialPodSecurityFsGroup = specSecCtx?.fsGroup;
  const initialPodSecuritySupGroups: number[] = specSecCtx?.supplementalGroups ?? [];
  // Validation Policy initial values
  const initialSkipWorkDirValidate = Boolean(cluster.spec?.validationPolicy?.skipWorkDirValidate);
  // Sidecars & Init Containers initial values
  const initialSidecars: SidecarConfig[] = (podSpec?.sidecars as SidecarConfig[] | undefined) ?? [];
  const initialInitContainers: SidecarConfig[] =
    (podSpec?.initContainers as SidecarConfig[] | undefined) ?? [];
  // Service Metadata initial values
  const specPodService = cluster.spec?.podService as
    | { metadata?: ServiceMetadataConfig }
    | undefined;
  const initialPodServiceConfig: ServiceMetadataConfig | null = specPodService?.metadata
    ? {
        annotations: specPodService.metadata.annotations,
        labels: specPodService.metadata.labels,
      }
    : specPodService
      ? {}
      : null;
  const specHeadlessService = cluster.spec?.headlessService as
    | { metadata?: ServiceMetadataConfig }
    | undefined;
  const initialHeadlessServiceConfig: ServiceMetadataConfig | null = specHeadlessService?.metadata
    ? {
        annotations: specHeadlessService.metadata.annotations,
        labels: specHeadlessService.metadata.labels,
      }
    : null;
  // Rack ID Override initial value
  const initialEnableRackIDOverride = Boolean(cluster.spec?.enableRackIDOverride);
  // Storage initial values - parse from CRD spec.storage.volumes
  const specStorage = cluster.spec?.storage as StorageSpec | undefined;
  const initialStorageVolumes: VolumeSpec[] = useMemo(() => {
    if (!specStorage || !("volumes" in specStorage)) return [];
    return (specStorage.volumes ?? []).map((v: Record<string, unknown>) => {
      const vol: VolumeSpec = {
        name: (v.name as string) || "",
        source: "emptyDir" as VolumeSourceType,
      };
      const src = v.source as Record<string, unknown> | undefined;
      if (src?.persistentVolume) {
        vol.source = "persistentVolume";
        const pv = src.persistentVolume as Record<string, unknown>;
        vol.persistentVolume = {
          storageClass: (pv.storageClass as string) || undefined,
          size: (pv.size as string) || "1Gi",
          volumeMode: (pv.volumeMode as "Filesystem" | "Block") || "Filesystem",
          accessModes: (pv.accessModes as string[]) || ["ReadWriteOnce"],
        };
      } else if (src?.emptyDir !== undefined) {
        vol.source = "emptyDir";
        vol.emptyDir = (src.emptyDir as Record<string, unknown>) || {};
      } else if (src?.secret) {
        vol.source = "secret";
        vol.secret = src.secret as Record<string, unknown>;
      } else if (src?.configMap) {
        vol.source = "configMap";
        vol.configMap = src.configMap as Record<string, unknown>;
      } else if (src?.hostPath) {
        vol.source = "hostPath";
        vol.hostPath = src.hostPath as Record<string, unknown>;
      }
      const aero = v.aerospike as Record<string, unknown> | undefined;
      if (aero) {
        vol.aerospike = {
          path: (aero.path as string) || "",
          readOnly: Boolean(aero.readOnly),
        };
      }
      if (v.initMethod) vol.initMethod = v.initMethod as VolumeInitMethod;
      if (v.wipeMethod) vol.wipeMethod = v.wipeMethod as VolumeWipeMethod;
      if (v.cascadeDelete) vol.cascadeDelete = Boolean(v.cascadeDelete);
      return vol;
    });
  }, [specStorage]);
  const initialStorageCleanupThreads = (specStorage as Record<string, unknown> | undefined)
    ?.cleanupThreads as number | undefined;
  const initialStorageDeleteLocalOnRestart = Boolean(
    (specStorage as Record<string, unknown> | undefined)?.deleteLocalStorageOnRestart,
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
      setTopologySpreadConstraints(initialTopologySpreadConstraints.map((t) => ({ ...t })));
      setPodSecurityRunAsUser(initialPodSecurityRunAsUser);
      setPodSecurityRunAsGroup(initialPodSecurityRunAsGroup);
      setPodSecurityRunAsNonRoot(initialPodSecurityRunAsNonRoot);
      setPodSecurityFsGroup(initialPodSecurityFsGroup);
      setPodSecuritySupGroups([...initialPodSecuritySupGroups]);
      setSkipWorkDirValidate(initialSkipWorkDirValidate);
      setSidecars(initialSidecars.map((s) => ({ ...s })));
      setInitContainers(initialInitContainers.map((c) => ({ ...c })));
      setPodServiceConfig(initialPodServiceConfig ? { ...initialPodServiceConfig } : null);
      setHeadlessServiceConfig(
        initialHeadlessServiceConfig ? { ...initialHeadlessServiceConfig } : null,
      );
      setEnableRackIDOverride(initialEnableRackIDOverride);
      setStorageVolumes(initialStorageVolumes.map((v) => ({ ...v })));
      setStorageCleanupThreads(initialStorageCleanupThreads);
      setStorageDeleteLocalOnRestart(initialStorageDeleteLocalOnRestart);
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
    initialTopologySpreadConstraints,
    initialPodSecurityRunAsUser,
    initialPodSecurityRunAsGroup,
    initialPodSecurityRunAsNonRoot,
    initialPodSecurityFsGroup,
    initialPodSecuritySupGroups,
    initialSkipWorkDirValidate,
    initialSidecars,
    initialInitContainers,
    initialPodServiceConfig,
    initialHeadlessServiceConfig,
    initialEnableRackIDOverride,
    initialStorageVolumes,
    initialStorageCleanupThreads,
    initialStorageDeleteLocalOnRestart,
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
    JSON.stringify(topologySpreadConstraints) !==
      JSON.stringify(initialTopologySpreadConstraints) ||
    podSecurityRunAsUser !== initialPodSecurityRunAsUser ||
    podSecurityRunAsGroup !== initialPodSecurityRunAsGroup ||
    podSecurityRunAsNonRoot !== initialPodSecurityRunAsNonRoot ||
    podSecurityFsGroup !== initialPodSecurityFsGroup ||
    JSON.stringify(podSecuritySupGroups) !== JSON.stringify(initialPodSecuritySupGroups) ||
    skipWorkDirValidate !== initialSkipWorkDirValidate ||
    JSON.stringify(sidecars) !== JSON.stringify(initialSidecars) ||
    JSON.stringify(initContainers) !== JSON.stringify(initialInitContainers) ||
    JSON.stringify(podServiceConfig) !== JSON.stringify(initialPodServiceConfig) ||
    JSON.stringify(headlessServiceConfig) !== JSON.stringify(initialHeadlessServiceConfig) ||
    enableRackIDOverride !== initialEnableRackIDOverride ||
    JSON.stringify(storageVolumes) !== JSON.stringify(initialStorageVolumes) ||
    storageCleanupThreads !== initialStorageCleanupThreads ||
    storageDeleteLocalOnRestart !== initialStorageDeleteLocalOnRestart;

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
        JSON.stringify(imagePullSecrets) !== JSON.stringify(initialImagePullSecrets) ||
        JSON.stringify(topologySpreadConstraints) !==
          JSON.stringify(initialTopologySpreadConstraints) ||
        podSecurityRunAsUser !== initialPodSecurityRunAsUser ||
        podSecurityRunAsGroup !== initialPodSecurityRunAsGroup ||
        podSecurityRunAsNonRoot !== initialPodSecurityRunAsNonRoot ||
        podSecurityFsGroup !== initialPodSecurityFsGroup ||
        JSON.stringify(podSecuritySupGroups) !== JSON.stringify(initialPodSecuritySupGroups);
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
          topologySpreadConstraints:
            topologySpreadConstraints.length > 0 ? topologySpreadConstraints : undefined,
          podSecurityContext:
            podSecurityRunAsUser != null ||
            podSecurityRunAsGroup != null ||
            podSecurityRunAsNonRoot ||
            podSecurityFsGroup != null ||
            podSecuritySupGroups.length > 0
              ? {
                  runAsUser: podSecurityRunAsUser,
                  runAsGroup: podSecurityRunAsGroup,
                  runAsNonRoot: podSecurityRunAsNonRoot || undefined,
                  fsGroup: podSecurityFsGroup,
                  supplementalGroups:
                    podSecuritySupGroups.length > 0 ? podSecuritySupGroups : undefined,
                }
              : undefined,
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

      // Sidecars & Init Containers
      if (JSON.stringify(sidecars) !== JSON.stringify(initialSidecars)) {
        data.sidecars = sidecars.length > 0 ? sidecars : undefined;
      }
      if (JSON.stringify(initContainers) !== JSON.stringify(initialInitContainers)) {
        data.initContainers = initContainers.length > 0 ? initContainers : undefined;
      }

      // Service Metadata
      if (JSON.stringify(podServiceConfig) !== JSON.stringify(initialPodServiceConfig)) {
        data.podService = podServiceConfig ?? undefined;
      }
      if (JSON.stringify(headlessServiceConfig) !== JSON.stringify(initialHeadlessServiceConfig)) {
        data.headlessService = headlessServiceConfig ?? undefined;
      }

      // Rack ID Override
      if (enableRackIDOverride !== initialEnableRackIDOverride) {
        data.enableRackIDOverride = enableRackIDOverride;
      }

      // Storage (multi-volume)
      const storageChanged =
        JSON.stringify(storageVolumes) !== JSON.stringify(initialStorageVolumes) ||
        storageCleanupThreads !== initialStorageCleanupThreads ||
        storageDeleteLocalOnRestart !== initialStorageDeleteLocalOnRestart;
      if (storageChanged) {
        data.storage = {
          volumes: storageVolumes,
          ...(storageCleanupThreads ? { cleanupThreads: storageCleanupThreads } : {}),
          ...(storageDeleteLocalOnRestart ? { deleteLocalStorageOnRestart: true } : {}),
        };
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
                  onChange={(e) => {
                    setAccessType(e.target.value as NetworkAccessType);
                    setError(null);
                  }}
                  id="edit-access-type"
                  disabled={loading}
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
                  value={fabricType || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFabricType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                  id="edit-fabric-type"
                  disabled={loading}
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
                  value={alternateAccessType || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAlternateAccessType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                  id="edit-alt-access"
                  disabled={loading}
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
                onChange={(e) => {
                  setNetworkPolicyConfig({
                    enabled: true,
                    type: e.target.value as "kubernetes" | "cilium",
                  });
                  setError(null);
                }}
                disabled={loading}
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
              value={nodeBlockList}
              onChange={(e) => {
                setNodeBlockList(e.target.value);
                setError(null);
              }}
              placeholder="node1, node2"
              disabled={loading}
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setPodManagementPolicy(v === "default" ? "" : v);
                    setError(null);
                  }}
                  id="edit-pod-mgmt-policy"
                  disabled={loading}
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
                  value={dnsPolicy || "default"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDnsPolicy(v === "default" ? "" : v);
                    setError(null);
                  }}
                  id="edit-dns-policy"
                  disabled={loading}
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

          {/* Storage (Multi-Volume) */}
          <EditCollapsible
            title="Storage Volumes"
            summary={
              storageVolumes.length > 0
                ? `${storageVolumes.length} volume${storageVolumes.length !== 1 ? "s" : ""}`
                : "Not configured"
            }
          >
            <EditStorageSection
              volumes={storageVolumes}
              cleanupThreads={storageCleanupThreads}
              deleteLocalOnRestart={storageDeleteLocalOnRestart}
              onVolumesChange={setStorageVolumes}
              onCleanupThreadsChange={setStorageCleanupThreads}
              onDeleteLocalChange={setStorageDeleteLocalOnRestart}
              loading={loading}
            />
          </EditCollapsible>

          {/* Topology Spread Constraints */}
          <EditCollapsible
            title="Topology Spread Constraints"
            summary={
              topologySpreadConstraints.length > 0
                ? `${topologySpreadConstraints.length} constraint(s)`
                : "None"
            }
          >
            <div className="space-y-3">
              <p className="text-base-content/60 text-[10px]">
                Control how pods are spread across topology domains.
              </p>
              {topologySpreadConstraints.map((tsc, idx) => (
                <div key={idx} className="space-y-2 rounded border p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium">Constraint #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTopologySpreadConstraints(
                          topologySpreadConstraints.filter((_, i) => i !== idx),
                        );
                        setError(null);
                      }}
                      className="text-base-content/60 hover:text-error p-0.5"
                      disabled={loading}
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
                          const next = [...topologySpreadConstraints];
                          next[idx] = { ...next[idx], maxSkew: parseInt(e.target.value) || 1 };
                          setTopologySpreadConstraints(next);
                          setError(null);
                        }}
                        className="h-7 text-[10px]"
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Topology Key</Label>
                      <Select
                        value={tsc.topologyKey}
                        onChange={(e) => {
                          const next = [...topologySpreadConstraints];
                          next[idx] = { ...next[idx], topologyKey: e.target.value };
                          setTopologySpreadConstraints(next);
                          setError(null);
                        }}
                        className="h-7 text-[10px]"
                        disabled={loading}
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
                          const next = [...topologySpreadConstraints];
                          next[idx] = {
                            ...next[idx],
                            whenUnsatisfiable: e.target.value as "DoNotSchedule" | "ScheduleAnyway",
                          };
                          setTopologySpreadConstraints(next);
                          setError(null);
                        }}
                        className="h-7 text-[10px]"
                        disabled={loading}
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
                        const next = [...topologySpreadConstraints];
                        next[idx] = {
                          ...next[idx],
                          labelSelector: Object.keys(labels).length > 0 ? labels : undefined,
                        };
                        setTopologySpreadConstraints(next);
                        setError(null);
                      }}
                      placeholder="e.g. app=aerospike"
                      className="h-7 text-[10px]"
                      disabled={loading}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTopologySpreadConstraints([
                    ...topologySpreadConstraints,
                    {
                      maxSkew: 1,
                      topologyKey: "topology.kubernetes.io/zone",
                      whenUnsatisfiable: "DoNotSchedule",
                    },
                  ]);
                  setError(null);
                }}
                className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium"
                disabled={loading}
              >
                <Plus className="h-3 w-3" /> Add Constraint
              </button>
            </div>
          </EditCollapsible>

          {/* Pod Security Context */}
          <EditCollapsible
            title="Pod Security Context"
            summary={
              [
                podSecurityRunAsUser != null ? `UID: ${podSecurityRunAsUser}` : null,
                podSecurityRunAsGroup != null ? `GID: ${podSecurityRunAsGroup}` : null,
                podSecurityRunAsNonRoot ? "Non-Root" : null,
                podSecurityFsGroup != null ? `fsGroup: ${podSecurityFsGroup}` : null,
              ]
                .filter(Boolean)
                .join(", ") || "Default"
            }
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
                    value={podSecurityRunAsUser ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPodSecurityRunAsUser(val ? parseInt(val, 10) : undefined);
                      setError(null);
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={loading}
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
                    value={podSecurityRunAsGroup ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPodSecurityRunAsGroup(val ? parseInt(val, 10) : undefined);
                      setError(null);
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={loading}
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
                    value={podSecurityFsGroup ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPodSecurityFsGroup(val ? parseInt(val, 10) : undefined);
                      setError(null);
                    }}
                    placeholder="e.g. 1000"
                    className="h-7 text-[10px]"
                    disabled={loading}
                  />
                </div>
                <div className="flex items-center gap-2 self-end pb-1">
                  <Switch
                    id="edit-run-as-non-root"
                    checked={podSecurityRunAsNonRoot}
                    onCheckedChange={(checked) => {
                      setPodSecurityRunAsNonRoot(checked);
                      setError(null);
                    }}
                    disabled={loading}
                  />
                  <Label htmlFor="edit-run-as-non-root" className="cursor-pointer text-[10px]">
                    Run As Non-Root
                  </Label>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-[10px] font-semibold">Supplemental Groups</Label>
                {podSecuritySupGroups.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {podSecuritySupGroups.map((gid) => (
                      <span
                        key={gid}
                        className="bg-accent/10 text-accent inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      >
                        {gid}
                        <button
                          type="button"
                          onClick={() => {
                            setPodSecuritySupGroups(podSecuritySupGroups.filter((g) => g !== gid));
                            setError(null);
                          }}
                          className="hover:bg-accent/20 ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full"
                          disabled={loading}
                        >
                          <X className="h-2 w-2" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <EditSupGroupInput
                  onAdd={(gid) => {
                    if (!podSecuritySupGroups.includes(gid)) {
                      setPodSecuritySupGroups([...podSecuritySupGroups, gid]);
                      setError(null);
                    }
                  }}
                  disabled={loading}
                />
              </div>
            </div>
          </EditCollapsible>

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
                <p className="text-base-content/60 text-[10px]">
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

          {/* Sidecars & Init Containers */}
          <EditSidecarsSection
            sidecars={sidecars}
            initContainers={initContainers}
            onSidecarsChange={setSidecars}
            onInitContainersChange={setInitContainers}
            loading={loading}
          />

          {/* Service Metadata */}
          <EditCollapsible
            title="Service Metadata"
            summary={
              [
                podServiceConfig != null ? "Pod Service" : null,
                headlessServiceConfig?.annotations || headlessServiceConfig?.labels
                  ? "Headless Service"
                  : null,
              ]
                .filter(Boolean)
                .join(", ") || "Default"
            }
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
                  checked={podServiceConfig != null}
                  onCheckedChange={(checked) => {
                    setPodServiceConfig(checked ? {} : null);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
              {podServiceConfig != null && (
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Pod Service Annotations</Label>
                    <EditKvEditor
                      value={podServiceConfig.annotations}
                      onChange={(v) => setPodServiceConfig({ ...podServiceConfig, annotations: v })}
                      keyPlaceholder="annotation key"
                      valuePlaceholder="value"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Pod Service Labels</Label>
                    <EditKvEditor
                      value={podServiceConfig.labels}
                      onChange={(v) => setPodServiceConfig({ ...podServiceConfig, labels: v })}
                      keyPlaceholder="label key"
                      valuePlaceholder="value"
                      disabled={loading}
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
                    <EditKvEditor
                      value={headlessServiceConfig?.annotations}
                      onChange={(v) => {
                        const next = { ...headlessServiceConfig, annotations: v };
                        if (!next.annotations && !next.labels) {
                          setHeadlessServiceConfig(null);
                        } else {
                          setHeadlessServiceConfig(next);
                        }
                        setError(null);
                      }}
                      keyPlaceholder="annotation key"
                      valuePlaceholder="value"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold">Labels</Label>
                    <EditKvEditor
                      value={headlessServiceConfig?.labels}
                      onChange={(v) => {
                        const next = { ...headlessServiceConfig, labels: v };
                        if (!next.annotations && !next.labels) {
                          setHeadlessServiceConfig(null);
                        } else {
                          setHeadlessServiceConfig(next);
                        }
                        setError(null);
                      }}
                      keyPlaceholder="label key"
                      valuePlaceholder="value"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            </div>
          </EditCollapsible>

          {/* Rack ID Override */}
          <EditCollapsible
            title="Rack ID Override"
            summary={enableRackIDOverride ? "Enabled" : "Disabled"}
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
                checked={enableRackIDOverride}
                onCheckedChange={(checked) => {
                  setEnableRackIDOverride(checked);
                  setError(null);
                }}
                disabled={loading}
              />
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
            {configError && <p className="text-error text-sm">{configError}</p>}
          </div>

          {error && <p className="text-error text-sm">{error}</p>}
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
  const [rawText, setRawText] = useState(() => (value ? JSON.stringify(value, null, 2) : ""));
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
          <code className="bg-base-200 truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
          <span className="text-base-content/60 text-[10px]">=</span>
          <code className="bg-base-200 flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">{v}</code>
          <button
            type="button"
            className="text-base-content/60 hover:text-base-content shrink-0"
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
          <span className="text-base-content/60 ml-1.5 text-[10px]">{summary}</span>
        </div>
        {open ? (
          <ChevronDown className="text-base-content/60 h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="text-base-content/60 h-3.5 w-3.5" />
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
          <p className="text-base-content/60 text-[10px]">
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
          <p className="text-base-content/60 text-[10px]">
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
                  onChange={(e) =>
                    updateToleration(idx, { operator: e.target.value as "Equal" | "Exists" })
                  }
                  className="h-7 w-20 text-[10px]"
                  disabled={disabled}
                >
                  <option value="Equal">Equal</option>
                  <option value="Exists">Exists</option>
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
                  onChange={(e) =>
                    updateToleration(idx, { effect: e.target.value as TolerationConfig["effect"] })
                  }
                  className="h-7 w-28 text-[10px]"
                  disabled={disabled}
                >
                  <option value="NoSchedule">NoSchedule</option>
                  <option value="PreferNoSchedule">PreferNoSchedule</option>
                  <option value="NoExecute">NoExecute</option>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => removeToleration(idx)}
                disabled={disabled}
                className="text-base-content/60 hover:text-error mb-1 self-end p-1"
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
              <p className="text-base-content/60 text-[10px]">
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
              <p className="text-base-content/60 text-[10px]">
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
          <p className="text-base-content/60 text-[10px]">
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

// ---------------------------------------------------------------------------
// Sidecars & Init Containers Section for Edit Dialog
// ---------------------------------------------------------------------------

function EditContainerEntry({
  container,
  onChange,
  onRemove,
  disabled,
}: {
  container: SidecarConfig;
  onChange: (updated: SidecarConfig) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = container.name || "(unnamed)";

  const updateField = <K extends keyof SidecarConfig>(key: K, value: SidecarConfig[K]) => {
    onChange({ ...container, [key]: value });
  };

  return (
    <div className="rounded border">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-left text-xs font-medium"
        >
          {expanded ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
          )}
          <span className="font-mono">{label}</span>
          {container.image && (
            <span className="text-muted-foreground text-[10px]">({container.image})</span>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive p-0.5"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 border-t px-3 pt-2 pb-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Name *</Label>
              <Input
                value={container.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g. log-collector"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Image *</Label>
              <Input
                value={container.image}
                onChange={(e) => updateField("image", e.target.value)}
                placeholder="e.g. fluent/fluent-bit:latest"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Command (comma-separated)</Label>
              <Input
                value={(container.command ?? []).join(", ")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateField("command", parts.length > 0 ? parts : undefined);
                }}
                placeholder='/bin/sh, -c, "echo hi"'
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
            <div className="grid gap-0.5">
              <Label className="text-[10px]">Args (comma-separated)</Label>
              <Input
                value={(container.args ?? []).join(", ")}
                onChange={(e) => {
                  const parts = e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  updateField("args", parts.length > 0 ? parts : undefined);
                }}
                placeholder="--config, /etc/config.yaml"
                className="h-7 text-[10px]"
                disabled={disabled}
              />
            </div>
          </div>
          {/* Env vars - simple comma-separated key=value */}
          <div className="grid gap-0.5">
            <Label className="text-[10px]">Env Vars (NAME=value, ...)</Label>
            <Input
              value={(container.env ?? []).map((e) => `${e.name}=${e.value ?? ""}`).join(", ")}
              onChange={(e) => {
                const entries = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const envList = entries
                  .map((entry) => {
                    const eqIdx = entry.indexOf("=");
                    if (eqIdx > 0) {
                      return {
                        name: entry.slice(0, eqIdx).trim(),
                        value: entry.slice(eqIdx + 1).trim() || undefined,
                      };
                    }
                    return { name: entry.trim() };
                  })
                  .filter((e) => e.name);
                updateField("env", envList.length > 0 ? envList : undefined);
              }}
              placeholder="MY_VAR=value, OTHER=123"
              className="h-7 text-[10px]"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditSidecarsSection({
  sidecars,
  initContainers,
  onSidecarsChange,
  onInitContainersChange,
  loading,
}: {
  sidecars: SidecarConfig[];
  initContainers: SidecarConfig[];
  onSidecarsChange: (sc: SidecarConfig[]) => void;
  onInitContainersChange: (ic: SidecarConfig[]) => void;
  loading: boolean;
}) {
  const totalCount = sidecars.length + initContainers.length;
  const summary =
    totalCount > 0
      ? [
          sidecars.length > 0 ? `${sidecars.length} sidecar(s)` : null,
          initContainers.length > 0 ? `${initContainers.length} init` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "None";

  return (
    <EditCollapsible title="Sidecars & Init Containers" summary={summary}>
      <div className="space-y-3">
        {/* Sidecars */}
        <div className="space-y-2">
          <Label className="text-[10px] font-semibold">Sidecar Containers</Label>
          {sidecars.map((sc, idx) => (
            <EditContainerEntry
              key={idx}
              container={sc}
              onChange={(updated) => {
                const next = [...sidecars];
                next[idx] = updated;
                onSidecarsChange(next);
              }}
              onRemove={() => onSidecarsChange(sidecars.filter((_, i) => i !== idx))}
              disabled={loading}
            />
          ))}
          <button
            type="button"
            onClick={() => onSidecarsChange([...sidecars, { name: "", image: "" }])}
            disabled={loading}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Sidecar
          </button>
        </div>

        {/* Init Containers */}
        <div className="space-y-2 border-t pt-2">
          <Label className="text-[10px] font-semibold">Init Containers</Label>
          {initContainers.map((ic, idx) => (
            <EditContainerEntry
              key={idx}
              container={ic}
              onChange={(updated) => {
                const next = [...initContainers];
                next[idx] = updated;
                onInitContainersChange(next);
              }}
              onRemove={() => onInitContainersChange(initContainers.filter((_, i) => i !== idx))}
              disabled={loading}
            />
          ))}
          <button
            type="button"
            onClick={() => onInitContainersChange([...initContainers, { name: "", image: "" }])}
            disabled={loading}
            className="text-accent hover:text-accent/80 flex items-center gap-1 text-[10px] font-medium disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add Init Container
          </button>
        </div>
      </div>
    </EditCollapsible>
  );
}

// ---------------------------------------------------------------------------
// EditStorageSection — multi-volume storage editing
// ---------------------------------------------------------------------------

const VOLUME_SOURCE_LABELS: Record<VolumeSourceType, string> = {
  persistentVolume: "PVC",
  emptyDir: "EmptyDir",
  secret: "Secret",
  configMap: "ConfigMap",
  hostPath: "HostPath",
};

function EditStorageSection({
  volumes,
  cleanupThreads,
  deleteLocalOnRestart,
  onVolumesChange,
  onCleanupThreadsChange,
  onDeleteLocalChange,
  loading,
}: {
  volumes: VolumeSpec[];
  cleanupThreads: number | undefined;
  deleteLocalOnRestart: boolean;
  onVolumesChange: (v: VolumeSpec[]) => void;
  onCleanupThreadsChange: (v: number | undefined) => void;
  onDeleteLocalChange: (v: boolean) => void;
  loading: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const updateVolume = (index: number, updated: VolumeSpec) => {
    const next = [...volumes];
    next[index] = updated;
    onVolumesChange(next);
  };

  const removeVolume = (index: number) => {
    onVolumesChange(volumes.filter((_, i) => i !== index));
    if (expandedIdx === index) setExpandedIdx(null);
  };

  const addVolume = (type: VolumeSourceType) => {
    const n = volumes.length + 1;
    const vol: VolumeSpec = {
      name: `vol-${n}`,
      source: type,
      aerospike: {
        path: type === "persistentVolume" ? "/opt/aerospike/data" : "/opt/aerospike/work",
      },
    };
    if (type === "persistentVolume") {
      vol.persistentVolume = {
        size: "10Gi",
        volumeMode: "Filesystem",
        accessModes: ["ReadWriteOnce"],
      };
    } else if (type === "emptyDir") {
      vol.emptyDir = {};
    } else if (type === "secret") {
      vol.secret = { secretName: "" };
    } else if (type === "configMap") {
      vol.configMap = { name: "" };
    } else if (type === "hostPath") {
      vol.hostPath = { path: "", type: "DirectoryOrCreate" };
    }
    onVolumesChange([...volumes, vol]);
    setExpandedIdx(volumes.length);
  };

  return (
    <div className="space-y-3">
      {/* Add buttons */}
      <div className="flex flex-wrap gap-1">
        {(Object.entries(VOLUME_SOURCE_LABELS) as [VolumeSourceType, string][]).map(
          ([type, label]) => (
            <button
              key={type}
              type="button"
              disabled={loading}
              onClick={() => addVolume(type)}
              className="text-accent hover:text-accent/80 flex items-center gap-0.5 text-[10px] font-medium disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> {label}
            </button>
          ),
        )}
      </div>

      {volumes.length === 0 && (
        <p className="text-muted-foreground py-2 text-center text-xs">No volumes configured.</p>
      )}

      {volumes.map((vol, vi) => {
        const isExpanded = expandedIdx === vi;
        return (
          <div key={vi} className="rounded border">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium"
                onClick={() => setExpandedIdx(isExpanded ? null : vi)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {vol.name || `vol-${vi + 1}`}
                <span className="text-muted-foreground text-[10px] font-normal">
                  [{VOLUME_SOURCE_LABELS[vol.source]}]
                </span>
                {vol.source === "persistentVolume" && vol.persistentVolume && (
                  <span className="text-muted-foreground text-[10px]">
                    {vol.persistentVolume.size}
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => removeVolume(vi)}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {isExpanded && (
              <div className="space-y-2 border-t px-2 pt-2 pb-2">
                {/* Name and source type */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Name</Label>
                    <Input
                      value={vol.name}
                      onChange={(e) => updateVolume(vi, { ...vol, name: e.target.value })}
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Source</Label>
                    <Select
                      value={vol.source}
                      onValueChange={(v) => {
                        const src = v as VolumeSourceType;
                        const updated: VolumeSpec = { ...vol, source: src };
                        if (src === "persistentVolume") {
                          updated.persistentVolume = {
                            size: "10Gi",
                            volumeMode: "Filesystem",
                            accessModes: ["ReadWriteOnce"],
                          };
                          updated.emptyDir = undefined;
                          updated.secret = undefined;
                          updated.configMap = undefined;
                          updated.hostPath = undefined;
                        } else if (src === "emptyDir") {
                          updated.emptyDir = {};
                          updated.persistentVolume = undefined;
                          updated.secret = undefined;
                          updated.configMap = undefined;
                          updated.hostPath = undefined;
                        } else if (src === "secret") {
                          updated.secret = { secretName: "" };
                          updated.persistentVolume = undefined;
                          updated.emptyDir = undefined;
                          updated.configMap = undefined;
                          updated.hostPath = undefined;
                        } else if (src === "configMap") {
                          updated.configMap = { name: "" };
                          updated.persistentVolume = undefined;
                          updated.emptyDir = undefined;
                          updated.secret = undefined;
                          updated.hostPath = undefined;
                        } else if (src === "hostPath") {
                          updated.hostPath = { path: "", type: "DirectoryOrCreate" };
                          updated.persistentVolume = undefined;
                          updated.emptyDir = undefined;
                          updated.secret = undefined;
                          updated.configMap = undefined;
                        }
                        updateVolume(vi, updated);
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(VOLUME_SOURCE_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* PVC source fields */}
                {vol.source === "persistentVolume" && vol.persistentVolume && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Storage Class</Label>
                      <Input
                        value={vol.persistentVolume.storageClass || ""}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: {
                              ...vol.persistentVolume!,
                              storageClass: e.target.value,
                            },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                        placeholder="standard"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Size</Label>
                      <Input
                        value={vol.persistentVolume.size}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: { ...vol.persistentVolume!, size: e.target.value },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                        placeholder="10Gi"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Volume Mode</Label>
                      <Select
                        value={vol.persistentVolume.volumeMode || "Filesystem"}
                        onValueChange={(v) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: {
                              ...vol.persistentVolume!,
                              volumeMode: v as "Filesystem" | "Block",
                            },
                          })
                        }
                        disabled={loading}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Filesystem" className="text-xs">
                            Filesystem
                          </SelectItem>
                          <SelectItem value="Block" className="text-xs">
                            Block
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Secret */}
                {vol.source === "secret" && (
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Secret Name</Label>
                    <Input
                      value={(vol.secret as Record<string, string>)?.secretName || ""}
                      onChange={(e) =>
                        updateVolume(vi, {
                          ...vol,
                          secret: { ...vol.secret, secretName: e.target.value },
                        })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                )}

                {/* ConfigMap */}
                {vol.source === "configMap" && (
                  <div className="grid gap-1">
                    <Label className="text-[10px]">ConfigMap Name</Label>
                    <Input
                      value={(vol.configMap as Record<string, string>)?.name || ""}
                      onChange={(e) =>
                        updateVolume(vi, {
                          ...vol,
                          configMap: { ...vol.configMap, name: e.target.value },
                        })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                )}

                {/* HostPath */}
                {vol.source === "hostPath" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Path</Label>
                      <Input
                        value={(vol.hostPath as Record<string, string>)?.path || ""}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            hostPath: { ...vol.hostPath, path: e.target.value },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Type</Label>
                      <Select
                        value={
                          (vol.hostPath as Record<string, string>)?.type || "DirectoryOrCreate"
                        }
                        onValueChange={(v) =>
                          updateVolume(vi, { ...vol, hostPath: { ...vol.hostPath, type: v } })
                        }
                        disabled={loading}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DirectoryOrCreate" className="text-xs">
                            DirectoryOrCreate
                          </SelectItem>
                          <SelectItem value="Directory" className="text-xs">
                            Directory
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Mount path */}
                <div className="grid gap-1">
                  <Label className="text-[10px]">Mount Path</Label>
                  <Input
                    value={vol.aerospike?.path || ""}
                    onChange={(e) =>
                      updateVolume(vi, {
                        ...vol,
                        aerospike: { ...vol.aerospike, path: e.target.value },
                      })
                    }
                    className="h-7 text-xs"
                    disabled={loading}
                    placeholder="/opt/aerospike/data"
                  />
                </div>

                {/* Init/Wipe/Cascade */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Init Method</Label>
                    <Select
                      value={vol.initMethod || "none"}
                      onValueChange={(v) =>
                        updateVolume(vi, {
                          ...vol,
                          initMethod: v === "none" ? undefined : (v as VolumeInitMethod),
                        })
                      }
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">
                          None
                        </SelectItem>
                        <SelectItem value="deleteFiles" className="text-xs">
                          Delete Files
                        </SelectItem>
                        <SelectItem value="dd" className="text-xs">
                          DD
                        </SelectItem>
                        <SelectItem value="blkdiscard" className="text-xs">
                          Block Discard
                        </SelectItem>
                        <SelectItem value="headerCleanup" className="text-xs">
                          Header Cleanup
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Wipe Method</Label>
                    <Select
                      value={vol.wipeMethod || "none"}
                      onValueChange={(v) =>
                        updateVolume(vi, {
                          ...vol,
                          wipeMethod: v === "none" ? undefined : (v as VolumeWipeMethod),
                        })
                      }
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">
                          None
                        </SelectItem>
                        <SelectItem value="deleteFiles" className="text-xs">
                          Delete Files
                        </SelectItem>
                        <SelectItem value="dd" className="text-xs">
                          DD
                        </SelectItem>
                        <SelectItem value="blkdiscard" className="text-xs">
                          Block Discard
                        </SelectItem>
                        <SelectItem value="headerCleanup" className="text-xs">
                          Header Cleanup
                        </SelectItem>
                        <SelectItem value="blkdiscardWithHeaderCleanup" className="text-xs">
                          Blk+Header
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-1.5 pb-1">
                    <Checkbox
                      checked={vol.cascadeDelete ?? false}
                      onCheckedChange={(checked) =>
                        updateVolume(vi, { ...vol, cascadeDelete: checked === true })
                      }
                      disabled={loading}
                    />
                    <Label className="text-[10px]">Cascade</Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Global storage policies */}
      {volumes.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <Label className="text-muted-foreground text-[10px]">Global Policies</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px]">Cleanup Threads</Label>
              <Input
                type="number"
                min={1}
                value={cleanupThreads ?? 1}
                onChange={(e) => onCleanupThreadsChange(parseInt(e.target.value) || undefined)}
                className="h-7 text-xs"
                disabled={loading}
              />
            </div>
            <div className="flex items-end gap-1.5 pb-1">
              <Checkbox
                checked={deleteLocalOnRestart}
                onCheckedChange={(checked) => onDeleteLocalChange(checked === true)}
                disabled={loading}
              />
              <Label className="text-[10px]">Delete local PVCs on restart</Label>
            </div>
          </div>
        </div>
      )}
    </div>
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

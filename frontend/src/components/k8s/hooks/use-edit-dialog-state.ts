"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type {
  K8sClusterDetail,
  NetworkAccessType,
  NetworkPolicyAutoConfig,
  MonitoringConfig,
  TolerationConfig,
  SidecarConfig,
  ServiceMetadataConfig,
  VolumeSpec,
  VolumeSourceType,
  StorageSpec,
  TopologySpreadConstraintConfig,
  PodSecurityContextConfig,
  PodMetadataConfig,
  SeedsFinderServicesConfig,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// EditDialogState — consolidated state for K8sEditDialog
// ---------------------------------------------------------------------------

export interface EditDialogState {
  image: string;
  size: number;
  enableDynamicConfig: boolean;
  aerospikeConfigText: string;
  batchSize: number | undefined;
  maxUnavailable: string;
  disablePDB: boolean;
  accessType: NetworkAccessType;
  fabricType: NetworkAccessType | "";
  alternateAccessType: NetworkAccessType | "";
  customAccessNames: string;
  customAltAccessNames: string;
  customFabricNames: string;
  networkPolicyConfig: NetworkPolicyAutoConfig | null;
  nodeBlockList: string;
  bandwidthIngress: string;
  bandwidthEgress: string;
  readinessGateEnabled: boolean;
  podMetadataLabels: string;
  podMetadataAnnotations: string;
  podManagementPolicy: string;
  dnsPolicy: string;
  monitoringConfig: MonitoringConfig | null;
  nodeSelector: Record<string, string>;
  tolerations: TolerationConfig[];
  multiPodPerHost: boolean;
  hostNetwork: boolean;
  serviceAccountName: string;
  terminationGracePeriod: number | undefined;
  imagePullSecrets: string[];
  topologySpreadConstraints: TopologySpreadConstraintConfig[];
  podSecurityRunAsUser: number | undefined;
  podSecurityRunAsGroup: number | undefined;
  podSecurityRunAsNonRoot: boolean;
  podSecurityFsGroup: number | undefined;
  podSecuritySupGroups: number[];
  skipWorkDirValidate: boolean;
  sidecars: SidecarConfig[];
  initContainers: SidecarConfig[];
  podServiceConfig: ServiceMetadataConfig | null;
  headlessServiceConfig: ServiceMetadataConfig | null;
  enableRackIDOverride: boolean;
  storageVolumes: VolumeSpec[];
  storageCleanupThreads: number | undefined;
  storageDeleteLocalOnRestart: boolean;
  seedsFinderServices: SeedsFinderServicesConfig | null;
  loading: boolean;
  error: string | null;
}

export interface EditDialogInitials {
  image: string;
  size: number;
  enableDynamicConfig: boolean;
  aerospikeConfigText: string;
  batchSize: number | undefined;
  maxUnavailable: string;
  disablePDB: boolean;
  accessType: NetworkAccessType;
  fabricType: NetworkAccessType | "";
  alternateAccessType: NetworkAccessType | "";
  customAccessNames: string;
  customAltAccessNames: string;
  customFabricNames: string;
  networkPolicyConfig: NetworkPolicyAutoConfig | null;
  nodeBlockList: string;
  bandwidthIngress: string;
  bandwidthEgress: string;
  readinessGateEnabled: boolean;
  podMetadataLabels: string;
  podMetadataAnnotations: string;
  podManagementPolicy: string;
  dnsPolicy: string;
  monitoringConfig: MonitoringConfig | null;
  nodeSelector: Record<string, string>;
  tolerations: TolerationConfig[];
  multiPodPerHost: boolean;
  hostNetwork: boolean;
  serviceAccountName: string;
  terminationGracePeriod: number | undefined;
  imagePullSecrets: string[];
  topologySpreadConstraints: TopologySpreadConstraintConfig[];
  podSecurityRunAsUser: number | undefined;
  podSecurityRunAsGroup: number | undefined;
  podSecurityRunAsNonRoot: boolean;
  podSecurityFsGroup: number | undefined;
  podSecuritySupGroups: number[];
  skipWorkDirValidate: boolean;
  sidecars: SidecarConfig[];
  initContainers: SidecarConfig[];
  podServiceConfig: ServiceMetadataConfig | null;
  headlessServiceConfig: ServiceMetadataConfig | null;
  enableRackIDOverride: boolean;
  storageVolumes: VolumeSpec[];
  storageCleanupThreads: number | undefined;
  storageDeleteLocalOnRestart: boolean;
  seedsFinderServices: SeedsFinderServicesConfig | null;
}

/** Derive all initial values from a K8sClusterDetail. */
function deriveInitials(cluster: K8sClusterDetail): EditDialogInitials {
  const networkPolicy = cluster.spec?.aerospikeNetworkPolicy;
  const podSpec = cluster.spec?.podSpec as Record<string, unknown> | undefined;
  const podMeta = podSpec?.metadata as PodMetadataConfig | undefined;
  const specPodScheduling = cluster.spec?.podScheduling;
  const specPodSpec = cluster.spec?.podSpec as Record<string, unknown> | undefined;
  const specSecCtx =
    specPodScheduling?.podSecurityContext ??
    (specPodSpec?.securityContext as PodSecurityContextConfig | undefined);
  const specStorage = cluster.spec?.storage as StorageSpec | undefined;
  const specPodService = cluster.spec?.podService as
    | { metadata?: ServiceMetadataConfig }
    | undefined;
  const specHeadlessService = cluster.spec?.headlessService as
    | { metadata?: ServiceMetadataConfig }
    | undefined;

  // Storage volumes
  const storageVolumes: VolumeSpec[] = (() => {
    if (!specStorage || !("volumes" in specStorage)) return [];
    return ((specStorage.volumes ?? []) as unknown as Record<string, unknown>[]).map((v) => {
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
      if (v.initMethod) vol.initMethod = v.initMethod as VolumeSpec["initMethod"];
      if (v.wipeMethod) vol.wipeMethod = v.wipeMethod as VolumeSpec["wipeMethod"];
      if (v.cascadeDelete) vol.cascadeDelete = Boolean(v.cascadeDelete);
      return vol;
    });
  })();

  const aerospikeConfig = cluster.spec?.aerospikeConfig ?? {};
  const aerospikeConfigText = JSON.stringify(aerospikeConfig, null, 2);

  return {
    image: cluster.image,
    size: cluster.size,
    enableDynamicConfig: Boolean(cluster.spec?.enableDynamicConfigUpdate),
    aerospikeConfigText,
    batchSize: cluster.spec?.rollingUpdateBatchSize ?? undefined,
    maxUnavailable: String(cluster.spec?.maxUnavailable ?? ""),
    disablePDB: Boolean(cluster.spec?.disablePDB),
    accessType: (networkPolicy?.accessType || "pod") as NetworkAccessType,
    fabricType: (networkPolicy?.fabricType || "") as NetworkAccessType | "",
    alternateAccessType: (networkPolicy?.alternateAccessType || "") as NetworkAccessType | "",
    customAccessNames: (networkPolicy?.customAccessNetworkNames ?? []).join(", "),
    customAltAccessNames: (networkPolicy?.customAlternateAccessNetworkNames ?? []).join(", "),
    customFabricNames: (networkPolicy?.customFabricNetworkNames ?? []).join(", "),
    networkPolicyConfig: cluster.spec?.networkPolicyConfig ?? null,
    nodeBlockList: (cluster.spec?.k8sNodeBlockList ?? []).join(", "),
    bandwidthIngress: cluster.spec?.bandwidthConfig?.ingress ?? "",
    bandwidthEgress: cluster.spec?.bandwidthConfig?.egress ?? "",
    readinessGateEnabled: Boolean(podSpec?.readinessGateEnabled),
    podMetadataLabels: podMeta?.labels
      ? Object.entries(podMeta.labels)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      : "",
    podMetadataAnnotations: podMeta?.annotations
      ? Object.entries(podMeta.annotations)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")
      : "",
    podManagementPolicy: (podSpec?.podManagementPolicy as string) || "",
    dnsPolicy: (podSpec?.dnsPolicy as string) || "",
    monitoringConfig: cluster.spec?.monitoring ?? null,
    nodeSelector:
      specPodScheduling?.nodeSelector ??
      (specPodSpec?.nodeSelector as Record<string, string> | undefined) ??
      {},
    tolerations:
      specPodScheduling?.tolerations ??
      (specPodSpec?.tolerations as TolerationConfig[] | undefined) ??
      [],
    multiPodPerHost: Boolean(
      specPodScheduling?.multiPodPerHost ?? (specPodSpec?.multiPodPerHost as boolean | undefined),
    ),
    hostNetwork: Boolean(
      specPodScheduling?.hostNetwork ?? (specPodSpec?.hostNetwork as boolean | undefined),
    ),
    serviceAccountName:
      specPodScheduling?.serviceAccountName ??
      (specPodSpec?.serviceAccountName as string | undefined) ??
      "",
    terminationGracePeriod:
      specPodScheduling?.terminationGracePeriodSeconds ??
      (specPodSpec?.terminationGracePeriodSeconds as number | undefined) ??
      undefined,
    imagePullSecrets:
      specPodScheduling?.imagePullSecrets ??
      (specPodSpec?.imagePullSecrets as string[] | undefined) ??
      [],
    topologySpreadConstraints:
      specPodScheduling?.topologySpreadConstraints ??
      (specPodSpec?.topologySpreadConstraints as TopologySpreadConstraintConfig[] | undefined) ??
      [],
    podSecurityRunAsUser: specSecCtx?.runAsUser,
    podSecurityRunAsGroup: specSecCtx?.runAsGroup,
    podSecurityRunAsNonRoot: Boolean(specSecCtx?.runAsNonRoot),
    podSecurityFsGroup: specSecCtx?.fsGroup,
    podSecuritySupGroups: specSecCtx?.supplementalGroups ?? [],
    skipWorkDirValidate: Boolean(cluster.spec?.validationPolicy?.skipWorkDirValidate),
    sidecars: (podSpec?.sidecars as SidecarConfig[] | undefined) ?? [],
    initContainers: (podSpec?.initContainers as SidecarConfig[] | undefined) ?? [],
    podServiceConfig: specPodService?.metadata
      ? {
          annotations: specPodService.metadata.annotations,
          labels: specPodService.metadata.labels,
        }
      : specPodService
        ? {}
        : null,
    headlessServiceConfig: specHeadlessService?.metadata
      ? {
          annotations: specHeadlessService.metadata.annotations,
          labels: specHeadlessService.metadata.labels,
        }
      : null,
    enableRackIDOverride: Boolean(cluster.spec?.enableRackIDOverride),
    storageVolumes,
    storageCleanupThreads: (specStorage as Record<string, unknown> | undefined)?.cleanupThreads as
      | number
      | undefined,
    storageDeleteLocalOnRestart: Boolean(
      (specStorage as Record<string, unknown> | undefined)?.deleteLocalStorageOnRestart,
    ),
    seedsFinderServices: cluster.spec?.seedsFinderServices ?? null,
  };
}

export function useEditDialogState(open: boolean, cluster: K8sClusterDetail) {
  const initials = useMemo(() => deriveInitials(cluster), [cluster]);

  const [state, setState] = useState<EditDialogState>(() => ({
    ...initials,
    loading: false,
    error: null,
  }));

  /** Merge partial updates into state (like setState but partial). */
  const patchState = useCallback((updates: Partial<EditDialogState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Capture a stable snapshot of initials when dialog opens, so auto-polling
  // doesn't reset the form while the user is editing.
  const initialsSnapshotRef = useRef(initials);
  useEffect(() => {
    if (open) {
      initialsSnapshotRef.current = initials;
    }
    // Only update snapshot when dialog opens, not when initials change during editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset form state only on open transition (false -> true)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const snap = initialsSnapshotRef.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: synchronize form state with dialog open/close
      setState({
        ...snap,
        // Deep-copy mutable collections
        nodeSelector: { ...snap.nodeSelector },
        tolerations: snap.tolerations.map((t) => ({ ...t })),
        imagePullSecrets: [...snap.imagePullSecrets],
        topologySpreadConstraints: snap.topologySpreadConstraints.map((t) => ({ ...t })),
        podSecuritySupGroups: [...snap.podSecuritySupGroups],
        sidecars: snap.sidecars.map((s) => ({ ...s })),
        initContainers: snap.initContainers.map((c) => ({ ...c })),
        podServiceConfig: snap.podServiceConfig ? { ...snap.podServiceConfig } : null,
        headlessServiceConfig: snap.headlessServiceConfig
          ? { ...snap.headlessServiceConfig }
          : null,
        storageVolumes: snap.storageVolumes.map((v) =>
          JSON.parse(JSON.stringify(v)),
        ),
        seedsFinderServices: snap.seedsFinderServices
          ? {
              loadBalancer: snap.seedsFinderServices.loadBalancer
                ? { ...snap.seedsFinderServices.loadBalancer }
                : undefined,
            }
          : null,
        loading: false,
        error: null,
      });
    }
    prevOpenRef.current = open;
  }, [open]);

  // Derive config error from current text (no effect needed)
  const configError = useMemo(() => {
    if (!state.aerospikeConfigText.trim()) return null;
    try {
      JSON.parse(state.aerospikeConfigText);
      return null;
    } catch {
      return "Invalid JSON";
    }
  }, [state.aerospikeConfigText]);

  const hasChanges =
    state.image !== initials.image ||
    state.size !== initials.size ||
    state.enableDynamicConfig !== initials.enableDynamicConfig ||
    state.aerospikeConfigText !== initials.aerospikeConfigText ||
    state.batchSize !== initials.batchSize ||
    state.maxUnavailable !== initials.maxUnavailable ||
    state.disablePDB !== initials.disablePDB ||
    state.accessType !== initials.accessType ||
    state.fabricType !== initials.fabricType ||
    state.alternateAccessType !== initials.alternateAccessType ||
    state.customAccessNames !== initials.customAccessNames ||
    state.customAltAccessNames !== initials.customAltAccessNames ||
    state.customFabricNames !== initials.customFabricNames ||
    JSON.stringify(state.networkPolicyConfig) !== JSON.stringify(initials.networkPolicyConfig) ||
    state.nodeBlockList !== initials.nodeBlockList ||
    state.bandwidthIngress !== initials.bandwidthIngress ||
    state.bandwidthEgress !== initials.bandwidthEgress ||
    state.readinessGateEnabled !== initials.readinessGateEnabled ||
    state.podMetadataLabels !== initials.podMetadataLabels ||
    state.podMetadataAnnotations !== initials.podMetadataAnnotations ||
    state.podManagementPolicy !== initials.podManagementPolicy ||
    state.dnsPolicy !== initials.dnsPolicy ||
    JSON.stringify(state.monitoringConfig) !== JSON.stringify(initials.monitoringConfig) ||
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
    JSON.stringify(state.podSecuritySupGroups) !== JSON.stringify(initials.podSecuritySupGroups) ||
    state.skipWorkDirValidate !== initials.skipWorkDirValidate ||
    JSON.stringify(state.sidecars) !== JSON.stringify(initials.sidecars) ||
    JSON.stringify(state.initContainers) !== JSON.stringify(initials.initContainers) ||
    JSON.stringify(state.podServiceConfig) !== JSON.stringify(initials.podServiceConfig) ||
    JSON.stringify(state.headlessServiceConfig) !==
      JSON.stringify(initials.headlessServiceConfig) ||
    state.enableRackIDOverride !== initials.enableRackIDOverride ||
    JSON.stringify(state.storageVolumes) !== JSON.stringify(initials.storageVolumes) ||
    state.storageCleanupThreads !== initials.storageCleanupThreads ||
    state.storageDeleteLocalOnRestart !== initials.storageDeleteLocalOnRestart ||
    JSON.stringify(state.seedsFinderServices) !== JSON.stringify(initials.seedsFinderServices);

  return { state, patchState, initials, hasChanges, configError };
}

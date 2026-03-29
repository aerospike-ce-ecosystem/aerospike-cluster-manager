import { create } from "zustand";
import type {
  K8sClusterSummary,
  K8sClusterDetail,
  K8sTemplateSummary,
  CreateK8sClusterRequest,
  UpdateK8sClusterRequest,
  K8sClusterEvent,
  ClusterHealthSummary,
  K8sNodeInfo,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { withLoading } from "@/lib/store-utils";
import { getErrorMessage } from "@/lib/utils";
import { K8S_DETAIL_POLL_INTERVAL_MS, K8S_DETAIL_POLL_MAX_BACKOFF_MS } from "@/lib/constants";
import { useK8sTemplateStore } from "./k8s-template-store";

// Module-level variables for detail polling
let _k8sDetailIntervalId: ReturnType<typeof setInterval> | null = null;

interface K8sClusterState {
  clusters: K8sClusterSummary[];
  selectedCluster: K8sClusterDetail | null;
  loading: boolean;
  error: string | null;
  k8sAvailable: boolean;
  detailEvents: K8sClusterEvent[];
  detailHealth: ClusterHealthSummary | null;
  consecutiveErrors: number;
  _pollingTarget: { namespace: string; name: string } | null;
  /** When true, SSE is providing data and polling is not needed */
  sseActive: boolean;

  // Infrastructure data (K8s namespaces, storage classes, secrets, nodes)
  k8sNamespaces: string[];
  k8sStorageClasses: string[];
  k8sSecrets: string[];
  k8sNodes: K8sNodeInfo[];

  checkAvailability: () => Promise<void>;
  fetchClusters: (namespace?: string) => Promise<void>;
  fetchCluster: (namespace: string, name: string) => Promise<void>;
  createCluster: (data: CreateK8sClusterRequest) => Promise<K8sClusterSummary>;
  deleteCluster: (namespace: string, name: string) => Promise<void>;
  scaleCluster: (namespace: string, name: string, size: number) => Promise<void>;
  triggerOperation: (
    namespace: string,
    name: string,
    kind: "WarmRestart" | "PodRestart",
    podList?: string[],
  ) => Promise<void>;
  updateCluster: (namespace: string, name: string, data: UpdateK8sClusterRequest) => Promise<void>;
  resyncTemplate: (namespace: string, name: string) => Promise<void>;
  pauseCluster: (namespace: string, name: string) => Promise<void>;
  resumeCluster: (namespace: string, name: string) => Promise<void>;
  startDetailPolling: (namespace: string, name: string) => void;
  stopDetailPolling: () => void;
  clearDetailData: () => void;
  /** SSE handlers for real-time updates */
  handleSSEDetail: (detail: K8sClusterDetail) => void;
  handleSSEEvents: (namespace: string, name: string, events: K8sClusterEvent[]) => void;
  handleSSEHealth: (namespace: string, name: string, health: ClusterHealthSummary) => void;
  setSSEActive: (active: boolean) => void;

  /** @deprecated Use useK8sTemplateStore instead. Kept for backward compatibility with the wizard. */
  templates: K8sTemplateSummary[];
  /** @deprecated Use useK8sTemplateStore instead. Kept for backward compatibility with the wizard. */
  fetchTemplates: () => Promise<void>;

  fetchK8sNamespaces: () => Promise<void>;
  fetchK8sStorageClasses: () => Promise<void>;
  fetchK8sSecrets: (namespace: string) => Promise<void>;
  fetchK8sNodes: () => Promise<void>;
}

export const useK8sClusterStore = create<K8sClusterState>()((set, get) => {
  const fetchClustersData = (namespace?: string) => api.getK8sClusters(namespace);

  const loadClusters = async (namespace?: string) => {
    const clusters = await fetchClustersData(namespace);
    set({ clusters, k8sAvailable: true, error: null });
  };

  const loadCluster = async (namespace: string, name: string) => {
    const cluster = await api.getK8sCluster(namespace, name);
    set({ selectedCluster: cluster });
  };

  return {
    clusters: [],
    selectedCluster: null,
    loading: false,
    error: null,
    k8sAvailable: false,
    detailEvents: [],
    detailHealth: null,
    consecutiveErrors: 0,
    _pollingTarget: null,
    sseActive: false,
    k8sNamespaces: [],
    k8sStorageClasses: [],
    k8sSecrets: [],
    k8sNodes: [],

    // Deprecated proxies — delegate to useK8sTemplateStore.
    // The wizard still reads `templates` and `fetchTemplates` from this store.
    templates: [],
    fetchTemplates: async () => {
      await useK8sTemplateStore.getState().fetchTemplates();
      set({ templates: useK8sTemplateStore.getState().templates });
    },

    checkAvailability: async () => {
      try {
        await api.getK8sClusters();
        set({ k8sAvailable: true });
      } catch (err) {
        // eslint-disable-next-line no-console -- intentional: surface K8s availability check failures
        console.warn("K8s API not available:", err);
        set({ k8sAvailable: false });
      }
    },

    fetchClusters: async (namespace?: string) => {
      if (get().loading) return;
      set({ loading: true, error: null });
      try {
        const clusters = await fetchClustersData(namespace);
        // Single atomic set so consumers see `loading: false` and updated clusters simultaneously.
        set({ clusters, k8sAvailable: true, loading: false, error: null });
      } catch (error) {
        set({ error: getErrorMessage(error), loading: false });
      }
    },

    fetchCluster: async (namespace: string, name: string) => {
      if (get().loading) return;
      await withLoading(set, async () => loadCluster(namespace, name));
    },

    createCluster: async (data: CreateK8sClusterRequest) => {
      if (get().loading) throw new Error("Another operation is in progress");
      const result = await withLoading(
        set,
        async () => {
          const res = await api.createK8sCluster(data);
          await loadClusters();
          return res;
        },
        { rethrow: true },
      );
      return result as K8sClusterSummary;
    },

    deleteCluster: async (namespace: string, name: string) => {
      if (get().loading) return;
      await withLoading(
        set,
        async () => {
          await api.deleteK8sCluster(namespace, name);
          set({ selectedCluster: null });
          await loadClusters();
        },
        { rethrow: true },
      );
    },

    scaleCluster: async (namespace: string, name: string, size: number) => {
      if (get().loading) return;
      await withLoading(
        set,
        async () => {
          await api.scaleK8sCluster(namespace, name, { size });
          await loadClusters();
          const { selectedCluster } = get();
          if (selectedCluster?.name === name && selectedCluster?.namespace === namespace) {
            await loadCluster(namespace, name);
          }
        },
        { rethrow: true },
      );
    },

    triggerOperation: async (
      namespace: string,
      name: string,
      kind: "WarmRestart" | "PodRestart",
      podList?: string[],
    ) => {
      await withLoading(
        set,
        async () => {
          await api.triggerK8sClusterOperation(namespace, name, { kind, podList });
          await loadCluster(namespace, name);
        },
        { rethrow: true },
      );
    },

    updateCluster: async (namespace: string, name: string, data: UpdateK8sClusterRequest) => {
      await withLoading(
        set,
        async () => {
          await api.updateK8sCluster(namespace, name, data);
          await loadClusters();
          await loadCluster(namespace, name);
        },
        { rethrow: true },
      );
    },

    resyncTemplate: async (namespace: string, name: string) => {
      await withLoading(
        set,
        async () => {
          await api.resyncK8sClusterTemplate(namespace, name);
          await loadCluster(namespace, name);
        },
        { rethrow: true },
      );
    },

    pauseCluster: async (namespace: string, name: string) => {
      await withLoading(
        set,
        async () => {
          await api.updateK8sCluster(namespace, name, { paused: true });
          await loadCluster(namespace, name);
        },
        { rethrow: true },
      );
    },

    resumeCluster: async (namespace: string, name: string) => {
      await withLoading(
        set,
        async () => {
          await api.updateK8sCluster(namespace, name, { paused: false });
          await loadCluster(namespace, name);
        },
        { rethrow: true },
      );
    },

    startDetailPolling: (namespace: string, name: string) => {
      if (_k8sDetailIntervalId) clearInterval(_k8sDetailIntervalId);
      set({ consecutiveErrors: 0, _pollingTarget: { namespace, name } });

      // If SSE is active, skip polling
      if (get().sseActive) return;

      const poll = async () => {
        const target = get()._pollingTarget;
        if (!target || get().sseActive) return;
        try {
          await loadCluster(target.namespace, target.name);
          const [events, health] = await Promise.all([
            api.getK8sClusterEvents(target.namespace, target.name).catch(() => get().detailEvents),
            api.getK8sClusterHealth(target.namespace, target.name).catch(() => get().detailHealth),
          ]);
          const hadErrors = get().consecutiveErrors > 0;
          set({ detailEvents: events, detailHealth: health, consecutiveErrors: 0 });
          // Reset interval back to base when recovering from errors
          if (hadErrors && _k8sDetailIntervalId) {
            clearInterval(_k8sDetailIntervalId);
            _k8sDetailIntervalId = setInterval(poll, K8S_DETAIL_POLL_INTERVAL_MS);
          }
        } catch (error) {
          const consecutiveErrors = get().consecutiveErrors + 1;
          set({ error: getErrorMessage(error), consecutiveErrors });
          // Restart interval with backed-off delay
          if (_k8sDetailIntervalId) {
            clearInterval(_k8sDetailIntervalId);
            const backoff = Math.min(
              K8S_DETAIL_POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors),
              K8S_DETAIL_POLL_MAX_BACKOFF_MS,
            );
            _k8sDetailIntervalId = setInterval(poll, backoff);
          }
        }
      };

      // Set the interval first so the catch block can see it, then call poll() immediately
      _k8sDetailIntervalId = setInterval(poll, K8S_DETAIL_POLL_INTERVAL_MS);
      poll();
    },

    stopDetailPolling: () => {
      if (_k8sDetailIntervalId) {
        clearInterval(_k8sDetailIntervalId);
        _k8sDetailIntervalId = null;
      }
      // Keep detailEvents and detailHealth so the UI doesn't flash empty
      // during phase transitions. Use clearDetailData() when navigating away.
      set({ consecutiveErrors: 0, _pollingTarget: null });
    },

    clearDetailData: () => {
      set({ detailEvents: [], detailHealth: null, selectedCluster: null });
    },

    handleSSEDetail: (detail) => {
      const target = get()._pollingTarget;
      if (target && detail.namespace === target.namespace && detail.name === target.name) {
        set({ selectedCluster: detail });
      }
    },

    handleSSEEvents: (namespace, name, events) => {
      const target = get()._pollingTarget;
      if (target && target.namespace === namespace && target.name === name) {
        set({ detailEvents: events, consecutiveErrors: 0 });
      }
    },

    handleSSEHealth: (namespace, name, health) => {
      const target = get()._pollingTarget;
      if (target && target.namespace === namespace && target.name === name) {
        set({ detailHealth: health, consecutiveErrors: 0 });
      }
    },

    setSSEActive: (active) => {
      set({ sseActive: active });
      if (active && _k8sDetailIntervalId) {
        clearInterval(_k8sDetailIntervalId);
        _k8sDetailIntervalId = null;
      } else if (!active && get()._pollingTarget) {
        // SSE failed — resume polling
        const target = get()._pollingTarget;
        if (target) {
          get().startDetailPolling(target.namespace, target.name);
        }
      }
    },

    fetchK8sNamespaces: async () => {
      const namespaces = await api.getK8sNamespaces();
      set({ k8sNamespaces: namespaces });
    },

    fetchK8sStorageClasses: async () => {
      const storageClasses = await api.getK8sStorageClasses();
      set({ k8sStorageClasses: storageClasses });
    },

    fetchK8sSecrets: async (namespace: string) => {
      try {
        const secrets = await api.getK8sSecrets(namespace);
        set({ k8sSecrets: secrets });
      } catch (err) {
        // eslint-disable-next-line no-console -- intentional: surface secret fetch failures
        console.error(`Failed to fetch K8s secrets for namespace ${namespace}:`, err);
        set({ k8sSecrets: [] });
      }
    },

    fetchK8sNodes: async () => {
      const nodes = await api.getK8sNodes();
      set({ k8sNodes: nodes });
    },
  };
});

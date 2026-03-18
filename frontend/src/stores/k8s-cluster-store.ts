import { create } from "zustand";
import type {
  K8sClusterSummary,
  K8sClusterDetail,
  K8sTemplateSummary,
  K8sTemplateDetail,
  CreateK8sClusterRequest,
  CreateK8sTemplateRequest,
  UpdateK8sClusterRequest,
  UpdateK8sTemplateRequest,
  K8sClusterEvent,
  ClusterHealthSummary,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { withLoading } from "@/lib/store-utils";
import { getErrorMessage } from "@/lib/utils";
import { K8S_DETAIL_POLL_INTERVAL_MS, K8S_DETAIL_POLL_MAX_BACKOFF_MS } from "@/lib/constants";

// Module-level variables for detail polling
let _k8sDetailIntervalId: ReturnType<typeof setInterval> | null = null;

interface K8sClusterState {
  clusters: K8sClusterSummary[];
  selectedCluster: K8sClusterDetail | null;
  templates: K8sTemplateSummary[];
  selectedTemplate: K8sTemplateDetail | null;
  loading: boolean;
  error: string | null;
  k8sAvailable: boolean;
  detailEvents: K8sClusterEvent[];
  detailHealth: ClusterHealthSummary | null;
  consecutiveErrors: number;
  _pollingTarget: { namespace: string; name: string } | null;

  checkAvailability: () => Promise<void>;
  fetchClusters: (namespace?: string) => Promise<void>;
  fetchCluster: (namespace: string, name: string) => Promise<void>;
  createCluster: (data: CreateK8sClusterRequest) => Promise<K8sClusterSummary>;
  deleteCluster: (namespace: string, name: string) => Promise<void>;
  scaleCluster: (namespace: string, name: string, size: number) => Promise<void>;
  fetchTemplates: () => Promise<void>;
  fetchTemplate: (name: string) => Promise<void>;
  createTemplate: (data: CreateK8sTemplateRequest) => Promise<K8sTemplateSummary>;
  updateTemplate: (name: string, data: UpdateK8sTemplateRequest) => Promise<void>;
  deleteTemplate: (name: string) => Promise<void>;
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
    templates: [],
    selectedTemplate: null,
    loading: false,
    error: null,
    k8sAvailable: false,
    detailEvents: [],
    detailHealth: null,
    consecutiveErrors: 0,
    _pollingTarget: null,

    checkAvailability: async () => {
      try {
        await api.getK8sClusters();
        set({ k8sAvailable: true });
      } catch {
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

    fetchTemplates: async () => {
      try {
        const templates = await api.getK8sTemplates();
        set({ templates });
      } catch {
        // Don't set global error — template fetch failures should not block cluster pages
      }
    },

    fetchTemplate: async (name: string) => {
      await withLoading(set, async () => {
        const template = await api.getK8sTemplate(name);
        set({ selectedTemplate: template });
      });
    },

    createTemplate: async (data: CreateK8sTemplateRequest) => {
      const result = await withLoading(
        set,
        async () => {
          const res = await api.createK8sTemplate(data);
          await get().fetchTemplates();
          return res;
        },
        { rethrow: true },
      );
      return result as K8sTemplateSummary;
    },

    updateTemplate: async (name: string, data: UpdateK8sTemplateRequest) => {
      await withLoading(
        set,
        async () => {
          await api.updateK8sTemplate(name, data);
          await get().fetchTemplate(name);
          await get().fetchTemplates();
        },
        { rethrow: true },
      );
    },

    deleteTemplate: async (name: string) => {
      await withLoading(
        set,
        async () => {
          await api.deleteK8sTemplate(name);
          set({ selectedTemplate: null });
          await get().fetchTemplates();
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

      const poll = async () => {
        const target = get()._pollingTarget;
        if (!target) return;
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
  };
});

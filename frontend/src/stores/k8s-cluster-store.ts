import { create } from "zustand";
import type {
  K8sClusterSummary,
  K8sClusterDetail,
  K8sTemplateSummary,
  K8sTemplateDetail,
  CreateK8sClusterRequest,
  CreateK8sTemplateRequest,
  UpdateK8sClusterRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { withLoading } from "@/lib/store-utils";

interface K8sClusterState {
  clusters: K8sClusterSummary[];
  selectedCluster: K8sClusterDetail | null;
  templates: K8sTemplateSummary[];
  selectedTemplate: K8sTemplateDetail | null;
  loading: boolean;
  error: string | null;
  k8sAvailable: boolean;

  checkAvailability: () => Promise<void>;
  fetchClusters: (namespace?: string) => Promise<void>;
  fetchCluster: (namespace: string, name: string) => Promise<void>;
  createCluster: (data: CreateK8sClusterRequest) => Promise<K8sClusterSummary>;
  deleteCluster: (namespace: string, name: string) => Promise<void>;
  scaleCluster: (namespace: string, name: string, size: number) => Promise<void>;
  fetchTemplates: (namespace?: string) => Promise<void>;
  fetchTemplate: (namespace: string, name: string) => Promise<void>;
  createTemplate: (data: CreateK8sTemplateRequest) => Promise<K8sTemplateSummary>;
  deleteTemplate: (namespace: string, name: string) => Promise<void>;
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
}

export const useK8sClusterStore = create<K8sClusterState>()((set, get) => ({
  clusters: [],
  selectedCluster: null,
  templates: [],
  selectedTemplate: null,
  loading: false,
  error: null,
  k8sAvailable: false,

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
    await withLoading(set, async () => {
      const clusters = await api.getK8sClusters(namespace);
      set({ clusters, k8sAvailable: true });
    });
  },

  fetchCluster: async (namespace: string, name: string) => {
    if (get().loading) return;
    await withLoading(set, async () => {
      const cluster = await api.getK8sCluster(namespace, name);
      set({ selectedCluster: cluster });
    });
  },

  createCluster: async (data: CreateK8sClusterRequest) => {
    if (get().loading) return {} as K8sClusterSummary;
    const result = await withLoading(set, async () => {
      const res = await api.createK8sCluster(data);
      await get().fetchClusters();
      return res;
    }, { rethrow: true });
    return result as K8sClusterSummary;
  },

  deleteCluster: async (namespace: string, name: string) => {
    if (get().loading) return;
    await withLoading(set, async () => {
      await api.deleteK8sCluster(namespace, name);
      set({ selectedCluster: null });
      await get().fetchClusters();
    }, { rethrow: true });
  },

  scaleCluster: async (namespace: string, name: string, size: number) => {
    if (get().loading) return;
    await withLoading(set, async () => {
      await api.scaleK8sCluster(namespace, name, { size });
      await get().fetchClusters();
      const { selectedCluster } = get();
      if (selectedCluster?.name === name && selectedCluster?.namespace === namespace) {
        await get().fetchCluster(namespace, name);
      }
    }, { rethrow: true });
  },

  fetchTemplates: async (namespace?: string) => {
    try {
      const templates = await api.getK8sTemplates(namespace);
      set({ templates });
    } catch {
      // Don't set global error — template fetch failures should not block cluster pages
    }
  },

  fetchTemplate: async (namespace: string, name: string) => {
    await withLoading(set, async () => {
      const template = await api.getK8sTemplate(namespace, name);
      set({ selectedTemplate: template });
    });
  },

  createTemplate: async (data: CreateK8sTemplateRequest) => {
    const result = await withLoading(set, async () => {
      const res = await api.createK8sTemplate(data);
      await get().fetchTemplates();
      return res;
    }, { rethrow: true });
    return result as K8sTemplateSummary;
  },

  deleteTemplate: async (namespace: string, name: string) => {
    await withLoading(set, async () => {
      await api.deleteK8sTemplate(namespace, name);
      set({ selectedTemplate: null });
      await get().fetchTemplates();
    }, { rethrow: true });
  },

  triggerOperation: async (
    namespace: string,
    name: string,
    kind: "WarmRestart" | "PodRestart",
    podList?: string[],
  ) => {
    await withLoading(set, async () => {
      await api.triggerK8sClusterOperation(namespace, name, { kind, podList });
      await get().fetchCluster(namespace, name);
    }, { rethrow: true });
  },

  updateCluster: async (namespace: string, name: string, data: UpdateK8sClusterRequest) => {
    await withLoading(set, async () => {
      await api.updateK8sCluster(namespace, name, data);
      await get().fetchClusters();
      await get().fetchCluster(namespace, name);
    }, { rethrow: true });
  },

  resyncTemplate: async (namespace: string, name: string) => {
    await withLoading(set, async () => {
      await api.resyncK8sClusterTemplate(namespace, name);
      await get().fetchCluster(namespace, name);
    }, { rethrow: true });
  },

  pauseCluster: async (namespace: string, name: string) => {
    await withLoading(set, async () => {
      await api.updateK8sCluster(namespace, name, { paused: true });
      await get().fetchCluster(namespace, name);
    }, { rethrow: true });
  },

  resumeCluster: async (namespace: string, name: string) => {
    await withLoading(set, async () => {
      await api.updateK8sCluster(namespace, name, { paused: false });
      await get().fetchCluster(namespace, name);
    }, { rethrow: true });
  },
}));

import { create } from "zustand";
import type {
  K8sClusterSummary,
  K8sClusterDetail,
  K8sTemplateSummary,
  CreateK8sClusterRequest,
  UpdateK8sClusterRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";

interface K8sClusterState {
  clusters: K8sClusterSummary[];
  selectedCluster: K8sClusterDetail | null;
  templates: K8sTemplateSummary[];
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
    set({ loading: true, error: null });
    try {
      const clusters = await api.getK8sClusters(namespace);
      set({ clusters, loading: false, k8sAvailable: true });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  fetchCluster: async (namespace: string, name: string) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const cluster = await api.getK8sCluster(namespace, name);
      set({ selectedCluster: cluster, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  createCluster: async (data: CreateK8sClusterRequest) => {
    if (get().loading) return {} as K8sClusterSummary;
    set({ loading: true, error: null });
    try {
      const result = await api.createK8sCluster(data);
      set({ loading: false });
      await get().fetchClusters();
      return result;
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  deleteCluster: async (namespace: string, name: string) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      await api.deleteK8sCluster(namespace, name);
      set({ selectedCluster: null, loading: false });
      await get().fetchClusters();
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  scaleCluster: async (namespace: string, name: string, size: number) => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      await api.scaleK8sCluster(namespace, name, { size });
      set({ loading: false });
      await get().fetchClusters();
      const { selectedCluster } = get();
      if (selectedCluster?.name === name && selectedCluster?.namespace === namespace) {
        await get().fetchCluster(namespace, name);
      }
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  fetchTemplates: async (namespace?: string) => {
    try {
      const templates = await api.getK8sTemplates(namespace);
      set({ templates });
    } catch {
      // Don't set global error — template fetch failures should not block cluster pages
    }
  },

  triggerOperation: async (
    namespace: string,
    name: string,
    kind: "WarmRestart" | "PodRestart",
    podList?: string[],
  ) => {
    set({ loading: true, error: null });
    try {
      await api.triggerK8sClusterOperation(namespace, name, { kind, podList });
      set({ loading: false });
      await get().fetchCluster(namespace, name);
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  updateCluster: async (namespace: string, name: string, data: UpdateK8sClusterRequest) => {
    set({ loading: true, error: null });
    try {
      await api.updateK8sCluster(namespace, name, data);
      set({ loading: false });
      await get().fetchClusters();
      await get().fetchCluster(namespace, name);
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  resyncTemplate: async (namespace: string, name: string) => {
    set({ loading: true, error: null });
    try {
      await api.resyncK8sClusterTemplate(namespace, name);
      set({ loading: false });
      await get().fetchCluster(namespace, name);
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  pauseCluster: async (namespace: string, name: string) => {
    set({ loading: true, error: null });
    try {
      await api.updateK8sCluster(namespace, name, { paused: true });
      set({ loading: false });
      await get().fetchCluster(namespace, name);
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },

  resumeCluster: async (namespace: string, name: string) => {
    set({ loading: true, error: null });
    try {
      await api.updateK8sCluster(namespace, name, { paused: false });
      set({ loading: false });
      await get().fetchCluster(namespace, name);
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
      throw error;
    }
  },
}));

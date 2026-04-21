/**
 * K8s cluster store — list of AerospikeCluster CRs + currently selected cluster key.
 * Kept minimal on purpose — detail fetching lives in hooks.
 */

import { create } from "zustand";

import { listK8sClusters, type ListK8sClustersParams } from "@/lib/api/k8s";
import type { K8sClusterSummary } from "@/lib/types/k8s";

export interface K8sClusterKey {
  namespace: string;
  name: string;
}

interface K8sClusterStore {
  clusters: K8sClusterSummary[];
  continueToken: string | null;
  hasMore: boolean;
  selectedKey: K8sClusterKey | null;
  isLoading: boolean;
  error: string | null;

  fetchClusters: (params?: ListK8sClustersParams) => Promise<void>;
  selectCluster: (key: K8sClusterKey | null) => void;
  reset: () => void;
}

export const useK8sClusterStore = create<K8sClusterStore>((set) => ({
  clusters: [],
  continueToken: null,
  hasMore: false,
  selectedKey: null,
  isLoading: false,
  error: null,

  fetchClusters: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await listK8sClusters(params);
      set({
        clusters: resp.items,
        continueToken: resp.continueToken ?? null,
        hasMore: resp.hasMore,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to load Kubernetes clusters",
      });
    }
  },

  selectCluster: (selectedKey) => set({ selectedKey }),

  reset: () =>
    set({
      clusters: [],
      continueToken: null,
      hasMore: false,
      selectedKey: null,
      isLoading: false,
      error: null,
    }),
}));

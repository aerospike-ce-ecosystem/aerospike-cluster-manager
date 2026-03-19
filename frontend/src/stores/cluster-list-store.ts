import { create } from "zustand";
import type {
  ConnectionProfile,
  ConnectionStatus,
  K8sClusterSummary,
  UnifiedClusterRow,
  ClusterSource,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";

interface ClusterListState {
  rows: UnifiedClusterRow[];
  healthStatuses: Record<string, ConnectionStatus>;
  loading: boolean;
  error: string | null;

  fetchAll: () => Promise<void>;
  fetchHealth: (connectionId: string) => Promise<void>;
  fetchAllHealth: () => void;
  updateMetadata: (
    connectionId: string,
    data: { label?: string; labelColor?: string; description?: string },
  ) => Promise<void>;
}

function buildHostString(conn: ConnectionProfile): string {
  const hasPort = conn.hosts.some((h) => h.includes(":"));
  if (hasPort) {
    return conn.hosts.join(", ");
  }
  return conn.hosts.map((h) => `${h}:${conn.port}`).join(", ");
}

function mapK8sPhaseToStatus(
  phase: K8sClusterSummary["phase"],
): UnifiedClusterRow["status"] {
  if (phase === "Completed") return "connected";
  if (phase === "Error") return "disconnected";
  return "checking";
}

function sortRows(rows: UnifiedClusterRow[]): UnifiedClusterRow[] {
  return [...rows].sort((a, b) => {
    // Connected first
    const aConnected = a.status === "connected" ? 0 : 1;
    const bConnected = b.status === "connected" ? 0 : 1;
    if (aConnected !== bConnected) return aConnected - bConnected;
    // Then alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

export const useClusterListStore = create<ClusterListState>()((set, get) => ({
  rows: [],
  healthStatuses: {},
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [connectionsResult, k8sResult] = await Promise.allSettled([
        api.getConnections(),
        api.getK8sClusters(),
      ]);

      const connections: ConnectionProfile[] =
        connectionsResult.status === "fulfilled" ? connectionsResult.value : [];
      const k8sClusters: K8sClusterSummary[] =
        k8sResult.status === "fulfilled" ? k8sResult.value : [];

      // Build a map of K8s clusters keyed by connectionId
      const k8sByConnectionId = new Map<string, K8sClusterSummary>();
      const standaloneK8s: K8sClusterSummary[] = [];

      for (const cluster of k8sClusters) {
        if (cluster.connectionId) {
          k8sByConnectionId.set(cluster.connectionId, cluster);
        } else {
          standaloneK8s.push(cluster);
        }
      }

      const rows: UnifiedClusterRow[] = [];

      // Create rows from connections
      for (const conn of connections) {
        const k8sCluster = k8sByConnectionId.get(conn.id);
        const isAckoManaged = !!k8sCluster;
        const source: ClusterSource = isAckoManaged ? "both" : "connection";

        rows.push({
          id: conn.id,
          name: conn.name,
          description: conn.description,
          label: conn.label,
          labelColor: conn.labelColor,
          source,
          status: "unknown",
          nodeCount: 0,
          hosts: buildHostString(conn),
          color: conn.color,
          isAckoManaged,
          k8sPhase: k8sCluster?.phase,
          k8sNamespace: k8sCluster?.namespace,
          k8sClusterName: k8sCluster?.name,
          connectionId: conn.id,
        });
      }

      // Create rows from standalone K8s clusters (no connectionId)
      for (const cluster of standaloneK8s) {
        rows.push({
          id: `k8s:${cluster.namespace}/${cluster.name}`,
          name: cluster.name,
          source: "k8s",
          status: mapK8sPhaseToStatus(cluster.phase),
          nodeCount: cluster.size,
          hosts: "",
          color: "#10B981",
          isAckoManaged: true,
          k8sPhase: cluster.phase,
          k8sNamespace: cluster.namespace,
          k8sClusterName: cluster.name,
        });
      }

      set({ rows: sortRows(rows), loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  fetchHealth: async (connectionId: string) => {
    try {
      const health = await api.getConnectionHealth(connectionId);
      set((state) => {
        const healthStatuses = { ...state.healthStatuses, [connectionId]: health };
        const rows = state.rows.map((row) => {
          if (row.connectionId !== connectionId) return row;
          return {
            ...row,
            status: (health.connected ? "connected" : "disconnected") as UnifiedClusterRow["status"],
            nodeCount: health.nodeCount,
            opsPerSec: health.totalOps,
            memoryUsed: health.memoryUsed,
            memoryTotal: health.memoryTotal,
            diskUsed: health.diskUsed,
            diskTotal: health.diskTotal,
            build: health.build,
            edition: health.edition,
          };
        });
        return { healthStatuses, rows: sortRows(rows) };
      });
    } catch {
      set((state) => {
        const healthStatuses = {
          ...state.healthStatuses,
          [connectionId]: { connected: false, nodeCount: 0, namespaceCount: 0 },
        };
        const rows = state.rows.map((row) => {
          if (row.connectionId !== connectionId) return row;
          return { ...row, status: "disconnected" as const };
        });
        return { healthStatuses, rows: sortRows(rows) };
      });
    }
  },

  fetchAllHealth: () => {
    const { rows, fetchHealth } = get();
    for (const row of rows) {
      if (row.source !== "k8s" && row.connectionId) {
        fetchHealth(row.connectionId);
      }
    }
  },

  updateMetadata: async (connectionId, data) => {
    try {
      await api.updateConnection(connectionId, data);
      set((state) => ({
        rows: state.rows.map((row) => {
          if (row.connectionId !== connectionId) return row;
          return {
            ...row,
            ...(data.label !== undefined && { label: data.label }),
            ...(data.labelColor !== undefined && { labelColor: data.labelColor }),
            ...(data.description !== undefined && { description: data.description }),
          };
        }),
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },
}));

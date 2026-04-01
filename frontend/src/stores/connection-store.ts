import { create } from "zustand";
import type { ConnectionProfile, ConnectionStatus } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";

interface HealthProgress {
  completed: number;
  total: number;
}

interface ConnectionState {
  connections: ConnectionProfile[];
  healthStatuses: Record<string, ConnectionStatus>;
  checkingHealth: Record<string, boolean>;
  healthProgress: HealthProgress | null;
  selectedConnectionId: string | null;
  loading: boolean;
  error: string | null;

  fetchConnections: () => Promise<void>;
  fetchConnectionHealth: (id: string) => Promise<void>;
  fetchAllHealth: () => Promise<void>;
  selectConnection: (id: string | null) => void;
  createConnection: (data: Partial<ConnectionProfile>) => Promise<void>;
  updateConnection: (id: string, data: Partial<ConnectionProfile>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (data: {
    hosts: string[];
    port: number;
    username?: string;
    password?: string;
  }) => Promise<{ success: boolean; message: string }>;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  connections: [],
  healthStatuses: {},
  checkingHealth: {},
  healthProgress: null,
  selectedConnectionId: null,
  loading: false,
  error: null,

  fetchConnections: async () => {
    set({ loading: true, error: null });
    try {
      const connections = await api.getConnections();
      set({ connections, loading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  fetchConnectionHealth: async (id: string) => {
    const { checkingHealth } = get();
    if (checkingHealth[id]) return;

    set({ checkingHealth: { ...get().checkingHealth, [id]: true } });
    try {
      const status = await api.getConnectionHealth(id);
      set((state) => ({
        healthStatuses: { ...state.healthStatuses, [id]: status },
        checkingHealth: { ...state.checkingHealth, [id]: false },
      }));
    } catch (err) {
      // eslint-disable-next-line no-console -- intentional: surface silent health-check failures for debugging
      console.error(`Health check failed for connection ${id}:`, err);
      const error = getErrorMessage(err);
      const errorType: import("@/lib/api/types").HealthErrorType | undefined =
        err && typeof err === "object" && "status" in err
          ? (String(err.status) as import("@/lib/api/types").HealthErrorType)
          : undefined;
      set((state) => ({
        healthStatuses: {
          ...state.healthStatuses,
          [id]: { connected: false, nodeCount: 0, namespaceCount: 0, error, errorType },
        },
        checkingHealth: { ...state.checkingHealth, [id]: false },
      }));
    }
  },

  fetchAllHealth: async () => {
    const { connections, fetchConnectionHealth } = get();
    const total = connections.length;
    if (total === 0) return;
    let completed = 0;
    set({ healthProgress: { completed: 0, total } });
    await Promise.allSettled(
      connections.map(async (conn) => {
        await fetchConnectionHealth(conn.id);
        completed++;
        set({ healthProgress: { completed, total } });
      }),
    );
    set({ healthProgress: null });
  },

  selectConnection: (id) => set({ selectedConnectionId: id }),

  createConnection: async (data) => {
    try {
      await api.createConnection(data);
      await get().fetchConnections();
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  updateConnection: async (id, data) => {
    try {
      await api.updateConnection(id, data);
      await get().fetchConnections();
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteConnection: async (id) => {
    try {
      await api.deleteConnection(id);
      const { selectedConnectionId } = get();
      if (selectedConnectionId === id) {
        set({ selectedConnectionId: null });
      }
      await get().fetchConnections();
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  testConnection: async (data) => {
    try {
      return await api.testConnection(data);
    } catch (error) {
      return { success: false, message: getErrorMessage(error) };
    }
  },
}));

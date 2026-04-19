/**
 * Connection store — keeps the list of saved connection profiles and
 * the currently selected `conn_id`. Mirrors the old `frontend/` version.
 *
 * Also tracks per-connection health snapshots populated from SSE
 * `connection.health` events (or periodic polling fallback) so the
 * sidebar can render a status dot without each component re-fetching.
 */

import { create } from "zustand"

import {
  createConnection,
  deleteConnection,
  listConnections,
  updateConnection,
} from "@/lib/api/connections"
import type {
  ConnectionProfileResponse,
  ConnectionStatus,
  CreateConnectionRequest,
  UpdateConnectionRequest,
} from "@/lib/types/connection"

interface ConnectionStore {
  connections: ConnectionProfileResponse[]
  currentConnId: string | null
  isLoading: boolean
  error: string | null
  /** connection.id → latest known health status. */
  healthStatuses: Record<string, ConnectionStatus>

  fetchConnections: () => Promise<void>
  selectConnection: (connId: string | null) => void
  addConnection: (
    body: CreateConnectionRequest,
  ) => Promise<ConnectionProfileResponse>
  editConnection: (
    connId: string,
    body: UpdateConnectionRequest,
  ) => Promise<ConnectionProfileResponse>
  removeConnection: (connId: string) => Promise<void>
  setHealth: (connId: string, status: ConnectionStatus) => void
  setHealthMap: (map: Record<string, ConnectionStatus>) => void
  reset: () => void
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  currentConnId: null,
  isLoading: false,
  error: null,
  healthStatuses: {},

  fetchConnections: async () => {
    set({ isLoading: true, error: null })
    try {
      const connections = await listConnections()
      set({ connections, isLoading: false })
    } catch (err) {
      set({
        isLoading: false,
        error:
          err instanceof Error ? err.message : "Failed to load connections",
      })
    }
  },

  selectConnection: (connId) => set({ currentConnId: connId }),

  addConnection: async (body) => {
    const created = await createConnection(body)
    set({ connections: [...get().connections, created] })
    return created
  },

  editConnection: async (connId, body) => {
    const updated = await updateConnection(connId, body)
    set({
      connections: get().connections.map((c) =>
        c.id === connId ? updated : c,
      ),
    })
    return updated
  },

  removeConnection: async (connId) => {
    await deleteConnection(connId)
    const currentId = get().currentConnId
    const { [connId]: _removed, ...remainingHealth } = get().healthStatuses
    set({
      connections: get().connections.filter((c) => c.id !== connId),
      currentConnId: currentId === connId ? null : currentId,
      healthStatuses: remainingHealth,
    })
  },

  setHealth: (connId, status) =>
    set({
      healthStatuses: { ...get().healthStatuses, [connId]: status },
    }),

  setHealthMap: (map) => set({ healthStatuses: map }),

  reset: () =>
    set({
      connections: [],
      currentConnId: null,
      isLoading: false,
      error: null,
      healthStatuses: {},
    }),
}))

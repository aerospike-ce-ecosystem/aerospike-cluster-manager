/**
 * UI store — sidebar expanded state, theme preference hints, etc.
 * Persisted to localStorage so the UI shell restores on reload.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

import { DEFAULT_WORKSPACE_ID } from "@/lib/types/workspace"

export type SidebarMode = "expanded" | "collapsed"
export type ClustersView = "card" | "table"

interface UiStore {
  sidebarMode: SidebarMode
  /** Which top-level section is currently active in the sidebar. */
  activeSection: string | null
  /** Preferred layout on /clusters — card grid vs. table list. */
  clustersView: ClustersView
  /** Currently selected workspace. The sidebar dropdown drives this. */
  currentWorkspaceId: string

  toggleSidebar: () => void
  setSidebarMode: (mode: SidebarMode) => void
  setActiveSection: (section: string | null) => void
  setClustersView: (view: ClustersView) => void
  setCurrentWorkspaceId: (id: string) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      sidebarMode: "expanded",
      activeSection: null,
      clustersView: "card",
      currentWorkspaceId: DEFAULT_WORKSPACE_ID,

      toggleSidebar: () =>
        set({
          sidebarMode:
            get().sidebarMode === "expanded" ? "collapsed" : "expanded",
        }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setActiveSection: (activeSection) => set({ activeSection }),
      setClustersView: (clustersView) => set({ clustersView }),
      setCurrentWorkspaceId: (currentWorkspaceId) =>
        set({ currentWorkspaceId }),
    }),
    {
      name: "acm-renewal-ui",
      version: 2,
      // Bumping version invalidates pre-workspace persisted state so the
      // hydrated store always has a valid currentWorkspaceId.
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== "object") return persisted
        if (version < 2) {
          return {
            ...(persisted as Record<string, unknown>),
            currentWorkspaceId: DEFAULT_WORKSPACE_ID,
          }
        }
        return persisted
      },
    },
  ),
)

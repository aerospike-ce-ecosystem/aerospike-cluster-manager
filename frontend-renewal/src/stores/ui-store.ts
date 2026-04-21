/**
 * UI store — sidebar expanded state, theme preference hints, etc.
 * Persisted to localStorage so the UI shell restores on reload.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarMode = "expanded" | "collapsed";

interface UiStore {
  sidebarMode: SidebarMode;
  /** Which top-level section is currently active in the sidebar. */
  activeSection: string | null;

  toggleSidebar: () => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setActiveSection: (section: string | null) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set, get) => ({
      sidebarMode: "expanded",
      activeSection: null,

      toggleSidebar: () =>
        set({
          sidebarMode: get().sidebarMode === "expanded" ? "collapsed" : "expanded",
        }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setActiveSection: (activeSection) => set({ activeSection }),
    }),
    {
      name: "acm-renewal-ui",
      version: 1,
    },
  ),
);

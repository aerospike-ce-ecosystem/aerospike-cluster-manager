import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  activeTab: string | null;
  mobileNavOpen: boolean;
  sidebarTreeExpanded: Record<string, boolean>;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: string | null) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  toggleSidebarTree: (namespace: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "system",
      sidebarOpen: true,
      activeTab: null,
      mobileNavOpen: false,
      sidebarTreeExpanded: {},
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
      toggleSidebarTree: (namespace) =>
        set((state) => ({
          sidebarTreeExpanded: {
            ...state.sidebarTreeExpanded,
            [namespace]: !state.sidebarTreeExpanded[namespace],
          },
        })),
    }),
    {
      name: "aerospike-cluster-manager-settings",
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
);

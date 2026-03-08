"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { MobileNav } from "./mobile-nav";
import { useUIStore } from "@/stores/ui-store";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSwipe } from "@/hooks/use-swipe";

function ThemeHandler() {
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(prefersDark ? "dark" : "light");

      const listener = (e: MediaQueryListEvent) => {
        root.classList.remove("light", "dark");
        root.classList.add(e.matches ? "dark" : "light");
      };
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return null;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDesktop } = useBreakpoint();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  useKeyboardShortcuts();

  const connIdMatch = pathname?.match(
    /\/(browser|cluster|indexes|admin|udfs|terminal|observability)\/([^/]+)/,
  );
  const connId = connIdMatch?.[2];
  const isConnectionPage = pathname === "/" || pathname === "/settings";

  // Close mobile drawer on route change
  useEffect(() => {
    if (!isDesktop) {
      setMobileNavOpen(false);
    }
  }, [pathname, isDesktop, setMobileNavOpen]);

  // Swipe from left edge to open sidebar
  useSwipe({
    onSwipeRight: () => {
      if (!isDesktop) setMobileNavOpen(true);
    },
    onSwipeLeft: () => {
      if (!isDesktop) setMobileNavOpen(false);
    },
  });

  return (
    <TooltipProvider delayDuration={150}>
      <ThemeHandler />
      <div className="bg-background flex h-screen flex-col">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <div className="flex min-h-0 flex-1 flex-col">
            {connId && !isConnectionPage && (
              <div className="hidden md:block">
                <TabBar connId={connId} />
              </div>
            )}
            <main
              className={`dot-pattern ambient-glow flex-1 overflow-auto ${connId && !isConnectionPage ? "pb-16 md:pb-0" : ""}`}
            >
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
          </div>
        </div>
        {/* Mobile bottom navigation */}
        {connId && !isConnectionPage && !isDesktop && <MobileNav connId={connId} />}
      </div>
    </TooltipProvider>
  );
}

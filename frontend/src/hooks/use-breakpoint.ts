"use client";

import { useState, useEffect } from "react";

type Breakpoint = "mobile" | "tablet" | "desktop";

interface BreakpointResult {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  breakpoint: Breakpoint;
}

export function useBreakpoint(): BreakpointResult {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | null>(null);

  useEffect(() => {
    const mqMobile = window.matchMedia("(max-width: 767px)");
    const mqTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");

    function update() {
      if (mqMobile.matches) setBreakpoint("mobile");
      else if (mqTablet.matches) setBreakpoint("tablet");
      else setBreakpoint("desktop");
    }

    update();
    mqMobile.addEventListener("change", update);
    mqTablet.addEventListener("change", update);
    return () => {
      mqMobile.removeEventListener("change", update);
      mqTablet.removeEventListener("change", update);
    };
  }, []);

  // Before the client-side effect runs (SSR / first paint), treat as desktop
  // so that booleans are stable and consumers need no null-checks.
  const resolved: Breakpoint = breakpoint ?? "desktop";

  return {
    isMobile: resolved === "mobile",
    isTablet: resolved === "tablet",
    isDesktop: resolved === "desktop",
    breakpoint: resolved,
  };
}

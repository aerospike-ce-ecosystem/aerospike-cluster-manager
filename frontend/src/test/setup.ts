import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

const matchMediaListeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

function evaluateMediaQuery(query: string) {
  const minWidth = query.match(/min-width:\s*(\d+)px/);
  const maxWidth = query.match(/max-width:\s*(\d+)px/);
  const min = minWidth ? Number.parseInt(minWidth[1], 10) : undefined;
  const max = maxWidth ? Number.parseInt(maxWidth[1], 10) : undefined;
  const width = window.innerWidth;

  if (min != null && width < min) return false;
  if (max != null && width > max) return false;
  return true;
}

// Ensure localStorage is available for zustand persist
if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage?.setItem) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
    },
    writable: true,
    configurable: true,
  });
}

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => {
    let matches = evaluateMediaQuery(query);
    const listeners =
      matchMediaListeners.get(query) ?? new Set<(event: MediaQueryListEvent) => void>();
    matchMediaListeners.set(query, listeners);

    return {
      media: query,
      get matches() {
        matches = evaluateMediaQuery(query);
        return matches;
      },
      onchange: null,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    };
  }),
});

Object.defineProperty(window, "resizeTo", {
  value: (width: number, height: number) => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: width,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: height,
    });

    matchMediaListeners.forEach((listeners, query) => {
      const event = {
        matches: evaluateMediaQuery(query),
        media: query,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    });

    window.dispatchEvent(new Event("resize"));
  },
});

window.resizeTo(1280, 800);

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

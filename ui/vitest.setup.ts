import "@testing-library/jest-dom/vitest"

import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

// Radix UI primitives (Select, Popover, …) call DOM methods that jsdom doesn't
// implement: hasPointerCapture / releasePointerCapture / scrollIntoView.
// Polyfill them globally so userEvent interactions on Radix components don't
// throw inside their internal pointer-capture logic.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {}
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}

// Node 25's experimental localStorage shadows jsdom's implementation but is
// not initialised in vitest's worker, leaving `localStorage.setItem` as a
// non-callable shape. Replace with a dead-simple in-memory polyfill so
// zustand persist works under vitest.
function makeMemoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, String(value))
    },
  }
}

if (typeof window !== "undefined") {
  const desc = Object.getOwnPropertyDescriptor(window, "localStorage")
  const ls = window.localStorage as Storage | undefined
  if (!ls || typeof ls.setItem !== "function" || (desc && desc.configurable)) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: makeMemoryStorage(),
    })
  }
  const sd = Object.getOwnPropertyDescriptor(window, "sessionStorage")
  const ss = window.sessionStorage as Storage | undefined
  if (!ss || typeof ss.setItem !== "function" || (sd && sd.configurable)) {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: makeMemoryStorage(),
    })
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

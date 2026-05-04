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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

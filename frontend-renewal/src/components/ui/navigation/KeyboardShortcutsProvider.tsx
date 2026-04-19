/**
 * KeyboardShortcutsProvider — registers global keyboard shortcuts for the
 * renewal shell. Mounts once near the root and does not render any UI
 * itself.
 *
 * Shortcuts:
 *   Cmd+B / Ctrl+B    — toggle sidebar (useUiStore().toggleSidebar)
 *   Cmd+K / Ctrl+K    — focus the global search input (data-global-search)
 *                       FIXME: renewal does not yet ship a global search
 *                       input; once one lands, give it
 *                       data-global-search="true" and the shortcut picks
 *                       it up automatically.
 *   /                 — focus the page-level filter input
 *                       (data-page-filter) if one is present. No-op otherwise.
 *
 * Notes:
 *  - Shortcuts are ignored when focus is in a text input, textarea or
 *    contenteditable element (except for the explicit Cmd+K case, which
 *    should always work).
 *  - Uses a single keydown listener on window to keep cost negligible.
 */

"use client"

import { useEffect } from "react"

import { useUiStore } from "@/stores/ui-store"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}

function focusFirst(selector: string): boolean {
  if (typeof document === "undefined") return false
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return false
  el.focus()
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select?.()
  }
  return true
}

export function KeyboardShortcutsProvider({
  children,
}: {
  children?: React.ReactNode
}) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // Cmd/Ctrl+B — toggle sidebar (always; non-text shortcut)
      if (mod && (e.key === "b" || e.key === "B")) {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd/Ctrl+K — focus global search; allowed regardless of current focus
      if (mod && (e.key === "k" || e.key === "K")) {
        const focused = focusFirst('[data-global-search="true"]')
        if (focused) {
          e.preventDefault()
        }
        // FIXME(stream-d): if no global search exists yet this is a no-op.
        // Add a <SearchInput data-global-search /> in the header when the
        // feature lands.
        return
      }

      // "/" — focus page filter input. Ignore when typing already.
      if (e.key === "/" && !mod && !e.altKey && !e.shiftKey) {
        if (isEditableTarget(e.target)) return
        const focused = focusFirst('[data-page-filter="true"]')
        if (focused) {
          e.preventDefault()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  return <>{children}</>
}

export default KeyboardShortcutsProvider

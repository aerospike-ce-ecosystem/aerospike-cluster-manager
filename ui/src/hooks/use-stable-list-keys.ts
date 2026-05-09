"use client"

import { useMemo, useRef } from "react"

/**
 * Maintains a parallel array of stable React keys for an externally
 * controlled, append/remove-only list. Use to key Stepper editable
 * lists whose entries serialize into a server-payload type and have
 * no natural id of their own. The consumer must call
 * `notifyAdd()` / `notifyRemove(i)` whenever the source list grows
 * or shrinks so the parallel keys array stays index-aligned.
 *
 * Why: keying such lists by `index` causes focus, IME composition,
 * and uncontrolled DOM state to leak from a removed entry into the
 * surviving entry that takes its slot.
 */

/**
 * Generate a stable id. Prefers `crypto.randomUUID` where available; falls
 * back to a base36 random string for non-secure-context / older browsers
 * that ship `crypto` without `randomUUID` (these keys never travel beyond
 * React reconciliation, so cryptographic strength is not required).
 */
const newId = (): string => {
  const c: { randomUUID?: () => string } | undefined = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto
  return c?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`
}

export function useStableListKeys(currentLength: number) {
  const keysRef = useRef<string[]>([])

  // Realign via useMemo keyed on currentLength so the work runs only when
  // the source list actually grows/shrinks (not on every render). Doing the
  // realignment unconditionally inside the render body — as the previous
  // implementation did — pushes new ids into the ref on every pass; under
  // React StrictMode's double-invoke that means the ids generated during
  // the first render are different from the ones generated during the
  // second, and every keyed child re-mounts at commit time.
  const keys = useMemo(() => {
    if (keysRef.current.length === currentLength) return keysRef.current
    if (keysRef.current.length < currentLength) {
      const next = [...keysRef.current]
      while (next.length < currentLength) next.push(newId())
      keysRef.current = next
    } else {
      keysRef.current = keysRef.current.slice(0, currentLength)
    }
    return keysRef.current
  }, [currentLength])

  const notifyAdd = () => {
    keysRef.current = [...keysRef.current, newId()]
  }
  const notifyRemove = (i: number) => {
    keysRef.current = keysRef.current.filter((_, idx) => idx !== i)
  }

  return { keys, notifyAdd, notifyRemove }
}

/**
 * In-flight request coalescing for fetch-on-mount hooks (#474).
 *
 * `useConnections` is called from 5 components and `useK8sClusters` from 4.
 * Each instance owns its own fetch-on-mount effect with no shared state, so a
 * single navigation fired roughly 7-9 identical requests — they all mount in
 * the same tick and all ask for the same thing.
 *
 * This coalesces them: while a request for a given key is in flight, every
 * further caller gets the *same* promise instead of starting another one. Once
 * it settles the entry is dropped, so the next call after that fetches fresh.
 *
 * Deliberately **not** a cache. A cache would need staleness rules, and getting
 * them wrong shows an operator a connection list that no longer matches
 * reality — worse than the duplicate requests this removes. Coalescing only
 * de-duplicates work that is already simultaneous, so no caller can observe
 * data older than its own call.
 */

type Pending<T> = Promise<T>

export interface SharedFetch<T> {
  /**
   * Run `fetcher`, or join the in-flight call for `key` if there is one.
   *
   * Rejections propagate to every joined caller, and the entry is cleared
   * either way — a failed request must not poison the key.
   */
  run: (key: string, fetcher: () => Promise<T>) => Promise<T>
  /** Test seam: forget every in-flight entry. */
  reset: () => void
  /** Number of in-flight entries, for tests. */
  readonly size: number
}

export function createSharedFetch<T>(): SharedFetch<T> {
  const inFlight = new Map<string, Pending<T>>()

  return {
    run(key, fetcher) {
      const existing = inFlight.get(key)
      if (existing) return existing

      const promise = fetcher().finally(() => {
        // Only clear if we are still the current entry. A `reset()` between
        // start and settle would otherwise let this delete a newer promise.
        if (inFlight.get(key) === promise) inFlight.delete(key)
      })
      inFlight.set(key, promise)
      return promise
    },
    reset() {
      inFlight.clear()
    },
    get size() {
      return inFlight.size
    },
  }
}

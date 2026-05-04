/**
 * useEventStream — subscribe to the backend SSE event stream.
 * Opens the stream on mount and closes it on unmount. Browser-only.
 */

"use client"

import { useEffect, useRef, useState } from "react"

import { subscribeEvents, type EventSubscription } from "@/lib/api/events"
import { logFetchError } from "@/lib/api/log"
import type { SSEEvent } from "@/lib/types/events"

export interface UseEventStreamOptions<T> {
  types?: string[]
  enabled?: boolean
  onMessage?: (event: SSEEvent<T>) => void
}

export interface UseEventStreamResult<T> {
  lastEvent: SSEEvent<T> | null
  connected: boolean
  error: Event | null
}

export function useEventStream<T = unknown>(
  options: UseEventStreamOptions<T> = {},
): UseEventStreamResult<T> {
  const { types, enabled = true, onMessage } = options
  const [lastEvent, setLastEvent] = useState<SSEEvent<T> | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<Event | null>(null)

  // Keep the latest onMessage in a ref so we don't re-subscribe when the
  // caller passes a fresh closure on every render.
  const handlerRef = useRef<typeof onMessage>(onMessage)
  handlerRef.current = onMessage

  const typesKey = types?.join(",") ?? ""

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return

    let cancelled = false
    let sub: EventSubscription | null = null
    try {
      sub = subscribeEvents<T>({
        types,
        onOpen: () => {
          if (!cancelled) setConnected(true)
        },
        onError: (err) => {
          if (cancelled) return
          logFetchError("event-stream", err)
          setError(err)
          setConnected(false)
        },
        onMessage: (event) => {
          if (cancelled) return
          setLastEvent(event)
          handlerRef.current?.(event)
        },
      })
    } catch (err) {
      // subscribeEvents throws on SSR — already guarded above, but be safe.
      logFetchError("event-stream", err)
      if (!cancelled) setError(err as Event)
    }

    return () => {
      cancelled = true
      sub?.close()
      setConnected(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- typesKey captures the intent
  }, [enabled, typesKey])

  return { lastEvent, connected, error }
}

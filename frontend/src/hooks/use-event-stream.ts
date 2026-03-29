"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SSEEventType, SSEConnectionStatus } from "@/lib/api/types";
import {
  SSE_RECONNECT_BASE_MS,
  SSE_RECONNECT_MAX_MS,
  SSE_HEARTBEAT_TIMEOUT_MS,
  SSE_MAX_RETRIES_BEFORE_FALLBACK,
} from "@/lib/constants";

interface UseEventStreamOptions {
  /** Event types to subscribe to (comma-separated in URL) */
  eventTypes: SSEEventType[];
  /** Callback invoked for each received event */
  onEvent: (event: { event: string; data: unknown }) => void;
  /** Whether the stream should be active */
  enabled?: boolean;
}

interface UseEventStreamResult {
  status: SSEConnectionStatus;
  /** True when SSE has given up and the consumer should fall back to polling */
  fallbackToPolling: boolean;
}

/**
 * React hook that manages an SSE (EventSource) connection with:
 * - Automatic reconnection with exponential backoff
 * - Tab visibility pause/resume
 * - Fallback to polling after repeated failures
 */
export function useEventStream({
  eventTypes,
  onEvent,
  enabled = true,
}: UseEventStreamOptions): UseEventStreamResult {
  const [status, setStatus] = useState<SSEConnectionStatus>("disconnected");
  const [fallbackToPolling, setFallbackToPolling] = useState(false);
  const retriesRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);

  // Keep onEvent ref up to date without re-triggering the effect
  onEventRef.current = onEvent;

  const typesKey = eventTypes.join(",");

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearTimers();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [clearTimers]);

  const resetHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      // No data received within heartbeat window — reconnect
      disconnect();
      setStatus("reconnecting");
      scheduleReconnect();
    }, SSE_HEARTBEAT_TIMEOUT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnect]);

  const scheduleReconnect = useCallback(() => {
    retriesRef.current += 1;
    if (retriesRef.current > SSE_MAX_RETRIES_BEFORE_FALLBACK) {
      setStatus("fallback");
      setFallbackToPolling(true);
      return;
    }
    const delay = Math.min(
      SSE_RECONNECT_BASE_MS * Math.pow(2, retriesRef.current - 1),
      SSE_RECONNECT_MAX_MS,
    );
    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(() => {
    disconnect();
    if (!enabled) return;

    const url = `/api/v1/events/stream${typesKey ? `?types=${encodeURIComponent(typesKey)}` : ""}`;
    setStatus("connecting");

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      retriesRef.current = 0;
      setFallbackToPolling(false);
      resetHeartbeatTimer();
    };

    // Listen for each event type individually so we get typed `event` field
    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        resetHeartbeatTimer();
        try {
          const parsed = JSON.parse(e.data);
          onEventRef.current({ event: type, data: parsed });
        } catch {
          // ignore malformed JSON
        }
      });
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStatus("reconnecting");
      scheduleReconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, typesKey, disconnect, resetHeartbeatTimer, scheduleReconnect]);

  // Visibility change: pause SSE when tab is hidden, resume on visible
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.hidden) {
        disconnect();
        setStatus("disconnected");
      } else if (!fallbackToPolling) {
        retriesRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, connect, disconnect, fallbackToPolling]);

  // Main connect/disconnect lifecycle
  useEffect(() => {
    if (!enabled || fallbackToPolling) {
      disconnect();
      if (!enabled) setStatus("disconnected");
      return;
    }

    connect();
    return () => disconnect();
  }, [enabled, connect, disconnect, fallbackToPolling]);

  return { status, fallbackToPolling };
}

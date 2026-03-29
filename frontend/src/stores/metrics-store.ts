import { create } from "zustand";
import type { ClusterMetrics } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import { METRIC_INTERVAL_MS } from "@/lib/constants";

// Module-level variables to avoid storing non-serializable values in Zustand state
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _visibilityCleanup: (() => void) | null = null;

const MAX_BACKOFF_MS = 60_000;

// Resets the polling interval without triggering an immediate fetchMetrics call.
// Used when recovering from errors so we don't create a re-entrant call chain.
function _resetInterval(delayMs: number, getState: () => MetricsState) {
  if (_intervalId) clearInterval(_intervalId);
  _intervalId = setInterval(() => {
    if (!getState()._isTabVisible) return;
    const currentConnId = getState()._pollingConnId;
    if (currentConnId) getState().fetchMetrics(currentConnId);
  }, delayMs);
}

interface MetricsState {
  metrics: ClusterMetrics | null;
  loading: boolean;
  error: string | null;
  _isFetching: boolean;
  _isTabVisible: boolean;
  _pollingConnId: string | null;
  consecutiveErrors: number;
  /** When true, SSE is providing data and polling is not needed */
  sseActive: boolean;

  fetchMetrics: (connId: string) => Promise<void>;
  startPolling: (connId: string) => void;
  stopPolling: () => void;
  /** Called by the SSE event handler to update metrics without polling */
  handleSSEMetrics: (metrics: ClusterMetrics) => void;
  /** Activate/deactivate SSE mode — when active, polling is paused */
  setSSEActive: (active: boolean) => void;
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  metrics: null,
  loading: false,
  error: null,
  _isFetching: false,
  _isTabVisible: true,
  _pollingConnId: null,
  consecutiveErrors: 0,
  sseActive: false,

  fetchMetrics: async (connId) => {
    // Prevent concurrent requests
    if (get()._isFetching) return;

    const isInitialLoad = get().metrics === null;
    set({ _isFetching: true, ...(isInitialLoad ? { loading: true } : {}), error: null });
    try {
      const metrics = await api.getMetrics(connId);
      const hadErrors = get().consecutiveErrors > 0;
      set({ metrics, loading: false, _isFetching: false, consecutiveErrors: 0 });
      // Reset interval back to base when recovering from errors (no immediate fetchMetrics call)
      if (hadErrors && _intervalId) {
        _resetInterval(METRIC_INTERVAL_MS, get);
      }
    } catch (error) {
      const consecutiveErrors = get().consecutiveErrors + 1;
      set({ error: getErrorMessage(error), loading: false, _isFetching: false, consecutiveErrors });
      // Restart interval with backed-off delay
      if (_intervalId) {
        const backoff = Math.min(
          METRIC_INTERVAL_MS * Math.pow(2, consecutiveErrors),
          MAX_BACKOFF_MS,
        );
        _resetInterval(backoff, get);
      }
    }
  },

  startPolling: (connId) => {
    if (_intervalId) clearInterval(_intervalId);
    if (_visibilityCleanup) _visibilityCleanup();

    set({ _pollingConnId: connId });

    // If SSE is active, skip polling — SSE provides the data
    if (get().sseActive) return;

    get().fetchMetrics(connId);

    _intervalId = setInterval(() => {
      // Skip polling when tab is not visible or SSE is active
      if (!get()._isTabVisible || get().sseActive) return;
      const currentConnId = get()._pollingConnId;
      if (currentConnId) get().fetchMetrics(currentConnId);
    }, METRIC_INTERVAL_MS);

    // Visibility change listener
    const handleVisibilityChange = () => {
      set({ _isTabVisible: !document.hidden });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    _visibilityCleanup = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

    set({ _isTabVisible: !document.hidden });
  },

  stopPolling: () => {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    if (_visibilityCleanup) {
      _visibilityCleanup();
      _visibilityCleanup = null;
    }
    set({ _isFetching: false, _pollingConnId: null });
  },

  handleSSEMetrics: (metrics) => {
    // Only accept metrics for the currently polling connection
    const connId = get()._pollingConnId;
    if (connId && metrics.connectionId === connId) {
      set({ metrics, loading: false, error: null, consecutiveErrors: 0 });
    }
  },

  setSSEActive: (active) => {
    set({ sseActive: active });
    if (active && _intervalId) {
      // SSE took over — stop polling
      clearInterval(_intervalId);
      _intervalId = null;
    } else if (!active && get()._pollingConnId) {
      // SSE failed — resume polling
      const connId = get()._pollingConnId;
      if (connId && !_intervalId) {
        get().fetchMetrics(connId);
        _intervalId = setInterval(() => {
          if (!get()._isTabVisible) return;
          const currentConnId = get()._pollingConnId;
          if (currentConnId) get().fetchMetrics(currentConnId);
        }, METRIC_INTERVAL_MS);
      }
    }
  },
}));

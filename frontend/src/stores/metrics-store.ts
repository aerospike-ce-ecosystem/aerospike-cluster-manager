import { create } from "zustand";
import type { ClusterMetrics } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import { METRIC_INTERVAL_MS } from "@/lib/constants";

// Module-level variables to avoid storing non-serializable values in Zustand state
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _visibilityCleanup: (() => void) | null = null;

const MAX_BACKOFF_MS = 60_000;

interface MetricsState {
  metrics: ClusterMetrics | null;
  loading: boolean;
  error: string | null;
  _isFetching: boolean;
  _isTabVisible: boolean;
  _pollingConnId: string | null;
  consecutiveErrors: number;

  fetchMetrics: (connId: string) => Promise<void>;
  startPolling: (connId: string) => void;
  stopPolling: () => void;
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  metrics: null,
  loading: false,
  error: null,
  _isFetching: false,
  _isTabVisible: true,
  _pollingConnId: null,
  consecutiveErrors: 0,

  fetchMetrics: async (connId) => {
    // Prevent concurrent requests
    if (get()._isFetching) return;

    const isInitialLoad = get().metrics === null;
    set({ _isFetching: true, ...(isInitialLoad ? { loading: true } : {}), error: null });
    try {
      const metrics = await api.getMetrics(connId);
      const hadErrors = get().consecutiveErrors > 0;
      set({ metrics, loading: false, _isFetching: false, consecutiveErrors: 0 });
      // Reset interval back to base when recovering from errors
      if (hadErrors && _intervalId) {
        const currentConnId = get()._pollingConnId;
        if (currentConnId) get().startPolling(currentConnId);
      }
    } catch (error) {
      const consecutiveErrors = get().consecutiveErrors + 1;
      set({ error: getErrorMessage(error), loading: false, _isFetching: false, consecutiveErrors });
      // Restart interval with backed-off delay
      if (_intervalId) {
        clearInterval(_intervalId);
        const backoff = Math.min(
          METRIC_INTERVAL_MS * Math.pow(2, consecutiveErrors),
          MAX_BACKOFF_MS,
        );
        _intervalId = setInterval(() => {
          if (!get()._isTabVisible) return;
          const currentConnId = get()._pollingConnId;
          if (currentConnId) get().fetchMetrics(currentConnId);
        }, backoff);
      }
    }
  },

  startPolling: (connId) => {
    if (_intervalId) clearInterval(_intervalId);
    if (_visibilityCleanup) _visibilityCleanup();

    set({ _pollingConnId: connId });
    get().fetchMetrics(connId);

    _intervalId = setInterval(() => {
      // Skip polling when tab is not visible
      if (!get()._isTabVisible) return;
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
}));

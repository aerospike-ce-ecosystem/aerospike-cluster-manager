/**
 * useK8sClusters — fetch the paginated list of AerospikeCluster CRs.
 * Pass optional params to filter (namespace / label selector / limit / continueToken).
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listK8sClusters, type ListK8sClustersParams } from "@/lib/api/k8s";
import type { K8sClusterListResponse } from "@/lib/types/k8s";

export interface UseK8sClustersResult {
  data: K8sClusterListResponse | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useK8sClusters(
  params?: ListK8sClustersParams,
): UseK8sClustersResult {
  const [data, setData] = useState<K8sClusterListResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stabilise the params object across renders — callers can pass an inline
  // literal without causing infinite re-fetches.
  const paramsRef = useRef<ListK8sClustersParams | undefined>(params);
  const paramsKey = JSON.stringify(params ?? {});
  paramsRef.current = params;

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listK8sClusters(paramsRef.current);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const result = await listK8sClusters(paramsRef.current);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramsKey]);

  return { data, error, isLoading, refetch };
}

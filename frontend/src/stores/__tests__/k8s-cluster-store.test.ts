import { beforeEach, describe, expect, it, vi } from "vitest";
import { useK8sClusterStore } from "../k8s-cluster-store";

vi.mock("@/lib/api/client", () => ({
  api: {
    getK8sClusters: vi.fn(),
    getK8sCluster: vi.fn(),
    createK8sCluster: vi.fn(),
    deleteK8sCluster: vi.fn(),
    scaleK8sCluster: vi.fn(),
    triggerK8sClusterOperation: vi.fn(),
    updateK8sCluster: vi.fn(),
    resyncK8sClusterTemplate: vi.fn(),
  },
}));

import { api } from "@/lib/api/client";

const mockApi = vi.mocked(api);

const clusterSummary = {
  name: "cluster-1",
  namespace: "team-a",
  size: 3,
  image: "aerospike:latest",
  phase: "Running",
  age: null,
  connectionId: null,
  autoConnectWarning: null,
} as any;

const clusterDetail = {
  ...clusterSummary,
  spec: {},
  status: {},
  pods: [],
  conditions: [],
  failedReconcileCount: 0,
  pendingRestartPods: [],
} as any;

describe("useK8sClusterStore", () => {
  beforeEach(() => {
    useK8sClusterStore.setState({
      clusters: [],
      selectedCluster: null,
      loading: false,
      error: null,
      k8sAvailable: false,
    });
    vi.clearAllMocks();
  });

  it("createCluster refreshes clusters before loading completes", async () => {
    mockApi.createK8sCluster.mockResolvedValue(clusterSummary);
    mockApi.getK8sClusters.mockResolvedValue({
      items: [clusterSummary],
      continueToken: null,
      hasMore: false,
    });

    const result = await useK8sClusterStore.getState().createCluster({
      name: "cluster-1",
      namespace: "team-a",
      size: 3,
      image: "aerospike:latest",
      namespaces: [],
      autoConnect: false,
    });

    expect(result).toEqual(clusterSummary);
    expect(mockApi.getK8sClusters).toHaveBeenCalledTimes(1);
    expect(useK8sClusterStore.getState().clusters).toEqual([clusterSummary]);
    expect(useK8sClusterStore.getState().loading).toBe(false);
  });

  it("triggerOperation refreshes cluster detail during the same action", async () => {
    const refreshedDetail = {
      ...clusterDetail,
      operationStatus: { phase: "Running" },
    } as any;
    mockApi.triggerK8sClusterOperation.mockResolvedValue(clusterSummary);
    mockApi.getK8sCluster.mockResolvedValue(refreshedDetail);

    await useK8sClusterStore
      .getState()
      .triggerOperation(clusterSummary.namespace, clusterSummary.name, "WarmRestart");

    expect(mockApi.getK8sCluster).toHaveBeenCalledWith(
      clusterSummary.namespace,
      clusterSummary.name,
    );
    expect(useK8sClusterStore.getState().selectedCluster).toEqual(refreshedDetail);
    expect(useK8sClusterStore.getState().loading).toBe(false);
  });

  it("scaleCluster refreshes both clusters and selected cluster detail", async () => {
    const scaledSummary = { ...clusterSummary, size: 5 } as any;
    const scaledDetail = { ...clusterDetail, size: 5 } as any;
    useK8sClusterStore.setState({ selectedCluster: clusterDetail });
    mockApi.scaleK8sCluster.mockResolvedValue(scaledSummary);
    mockApi.getK8sClusters.mockResolvedValue({
      items: [scaledSummary],
      continueToken: null,
      hasMore: false,
    });
    mockApi.getK8sCluster.mockResolvedValue(scaledDetail);

    await useK8sClusterStore
      .getState()
      .scaleCluster(clusterSummary.namespace, clusterSummary.name, 5);

    expect(mockApi.getK8sClusters).toHaveBeenCalledTimes(1);
    expect(mockApi.getK8sCluster).toHaveBeenCalledWith(
      clusterSummary.namespace,
      clusterSummary.name,
    );
    expect(useK8sClusterStore.getState().clusters).toEqual([scaledSummary]);
    expect(useK8sClusterStore.getState().selectedCluster).toEqual(scaledDetail);
  });
});

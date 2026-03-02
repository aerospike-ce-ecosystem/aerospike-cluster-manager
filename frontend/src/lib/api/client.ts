import { ApiError } from "./errors";
import { getErrorMessage } from "@/lib/utils";

const BASE_URL = "";
const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY = 1000;

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

async function request<T>(path: string, options?: RequestInit & { timeout?: number }): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options ?? {};
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...fetchOptions?.headers,
        },
        signal: controller.signal,
        ...fetchOptions,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: res.statusText }));
        const apiError = new ApiError(
          error.message || `Request failed: ${res.status}`,
          res.status,
          error.code,
        );

        // Only retry on server errors
        if (isRetryable(res.status) && attempt < MAX_RETRIES) {
          lastError = apiError;
          await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY * 2 ** attempt));
          continue;
        }

        throw apiError;
      }

      if (res.status === 204) {
        return undefined as T;
      }

      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) throw err;

      // Retry on network errors
      if (attempt < MAX_RETRIES && !(err instanceof DOMException && err.name === "AbortError")) {
        lastError = err as Error;
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY * 2 ** attempt));
        continue;
      }

      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError("Request timed out", 408);
      }

      throw new ApiError(getErrorMessage(err) || "Network error", 0);
    }
  }

  throw lastError || new ApiError("Request failed after retries", 0);
}

export const api = {
  // Connections
  getConnections: () => request<import("./types").ConnectionProfile[]>("/api/connections"),
  getConnectionHealth: (id: string) =>
    request<import("./types").ConnectionStatus>(`/api/connections/${id}/health`, {
      timeout: 10_000,
    }),
  createConnection: (data: Partial<import("./types").ConnectionProfile>) =>
    request<import("./types").ConnectionProfile>("/api/connections", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateConnection: (id: string, data: Partial<import("./types").ConnectionProfile>) =>
    request<import("./types").ConnectionProfile>(`/api/connections/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteConnection: (id: string) => request<void>(`/api/connections/${id}`, { method: "DELETE" }),
  testConnection: (data: { hosts: string[]; port: number; username?: string; password?: string }) =>
    request<{ success: boolean; message: string }>("/api/connections/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Cluster
  getCluster: (connId: string) => request<import("./types").ClusterInfo>(`/api/clusters/${connId}`),
  configureNamespace: (connId: string, data: import("./types").ConfigureNamespaceRequest) =>
    request<{ message: string }>(`/api/clusters/${connId}/namespaces`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Records
  getRecords: (connId: string, ns: string, set: string, page = 1, pageSize = 25) =>
    request<import("./types").RecordListResponse>(
      `/api/records/${connId}?ns=${ns}&set=${set}&page=${page}&pageSize=${pageSize}`,
    ),
  putRecord: (connId: string, data: import("./types").RecordWriteRequest) =>
    request<import("./types").AerospikeRecord>(`/api/records/${connId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRecord: (connId: string, ns: string, set: string, pk: string) =>
    request<void>(`/api/records/${connId}?ns=${ns}&set=${set}&pk=${pk}`, {
      method: "DELETE",
    }),
  getFilteredRecords: (
    connId: string,
    body: import("./types").FilteredQueryRequest,
  ): Promise<import("./types").FilteredQueryResponse> =>
    request<import("./types").FilteredQueryResponse>(`/api/records/${connId}/filter`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Query
  executeQuery: (connId: string, query: import("./types").QueryRequest) =>
    request<import("./types").QueryResponse>(`/api/query/${connId}`, {
      method: "POST",
      body: JSON.stringify(query),
    }),

  // Indexes
  getIndexes: (connId: string) =>
    request<import("./types").SecondaryIndex[]>(`/api/indexes/${connId}`),
  createIndex: (connId: string, data: import("./types").CreateIndexRequest) =>
    request<import("./types").SecondaryIndex>(`/api/indexes/${connId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteIndex: (connId: string, name: string, ns: string) =>
    request<void>(`/api/indexes/${connId}?name=${name}&ns=${ns}`, {
      method: "DELETE",
    }),

  // Admin
  getUsers: (connId: string) =>
    request<import("./types").AerospikeUser[]>(`/api/admin/${connId}/users`),
  createUser: (connId: string, data: import("./types").CreateUserRequest) =>
    request<import("./types").AerospikeUser>(`/api/admin/${connId}/users`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  changePassword: (connId: string, username: string, password: string) =>
    request<{ message: string }>(`/api/admin/${connId}/users`, {
      method: "PATCH",
      body: JSON.stringify({ username, password }),
    }),
  deleteUser: (connId: string, username: string) =>
    request<void>(`/api/admin/${connId}/users?username=${username}`, {
      method: "DELETE",
    }),
  getRoles: (connId: string) =>
    request<import("./types").AerospikeRole[]>(`/api/admin/${connId}/roles`),
  createRole: (connId: string, data: import("./types").CreateRoleRequest) =>
    request<import("./types").AerospikeRole>(`/api/admin/${connId}/roles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRole: (connId: string, name: string) =>
    request<void>(`/api/admin/${connId}/roles?name=${name}`, {
      method: "DELETE",
    }),

  // UDFs
  getUDFs: (connId: string) => request<import("./types").UDFModule[]>(`/api/udfs/${connId}`),
  uploadUDF: (connId: string, data: { filename: string; content: string }) =>
    request<import("./types").UDFModule>(`/api/udfs/${connId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteUDF: (connId: string, filename: string) =>
    request<void>(`/api/udfs/${connId}?filename=${filename}`, {
      method: "DELETE",
    }),

  // Sample Data
  createSampleData: (connId: string, data: import("./types").CreateSampleDataRequest) =>
    request<import("./types").CreateSampleDataResponse>(`/api/sample-data/${connId}`, {
      method: "POST",
      body: JSON.stringify(data),
      timeout: 60_000,
    }),

  // Terminal
  executeCommand: (connId: string, command: string) =>
    request<import("./types").TerminalCommand>(`/api/terminal/${connId}`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  // Metrics
  getMetrics: (connId: string) =>
    request<import("./types").ClusterMetrics>(`/api/metrics/${connId}`),

  // K8s Clusters
  getK8sClusters: (namespace?: string) =>
    request<import("./types").K8sClusterSummary[]>(
      `/api/k8s/clusters${namespace ? `?namespace=${namespace}` : ""}`,
    ),
  getK8sCluster: (namespace: string, name: string) =>
    request<import("./types").K8sClusterDetail>(`/api/k8s/clusters/${namespace}/${name}`),
  createK8sCluster: (data: import("./types").CreateK8sClusterRequest) =>
    request<import("./types").K8sClusterSummary>("/api/k8s/clusters", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateK8sCluster: (
    namespace: string,
    name: string,
    data: import("./types").UpdateK8sClusterRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(`/api/k8s/clusters/${namespace}/${name}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteK8sCluster: (namespace: string, name: string) =>
    request<void>(`/api/k8s/clusters/${namespace}/${name}`, { method: "DELETE" }),
  scaleK8sCluster: (
    namespace: string,
    name: string,
    data: import("./types").ScaleK8sClusterRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(`/api/k8s/clusters/${namespace}/${name}/scale`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getK8sNamespaces: () => request<string[]>("/api/k8s/namespaces"),
  getK8sStorageClasses: () => request<string[]>("/api/k8s/storageclasses"),

  // K8s Templates
  getK8sTemplates: (namespace?: string) =>
    request<import("./types").K8sTemplateSummary[]>(
      `/api/k8s/templates${namespace ? `?namespace=${namespace}` : ""}`,
    ),
  getK8sTemplate: (namespace: string, name: string) =>
    request<import("./types").K8sTemplateDetail>(`/api/k8s/templates/${namespace}/${name}`),

  // K8s Cluster Events
  getK8sClusterEvents: (namespace: string, name: string) =>
    request<import("./types").K8sClusterEvent[]>(
      `/api/k8s/clusters/${namespace}/${name}/events`,
    ),

  // K8s Cluster Operations
  triggerK8sClusterOperation: (
    namespace: string,
    name: string,
    data: import("./types").OperationRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${namespace}/${name}/operations`,
      { method: "POST", body: JSON.stringify(data) },
    ),
};

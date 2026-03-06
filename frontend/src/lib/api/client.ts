import { ApiError } from "./errors";
import { getErrorMessage } from "@/lib/utils";

const BASE_URL = "";
const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY = 1000;

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

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
    request<import("./types").ConnectionStatus>(`/api/connections/${encodePathSegment(id)}/health`, {
      timeout: 10_000,
    }),
  createConnection: (data: Partial<import("./types").ConnectionProfile>) =>
    request<import("./types").ConnectionProfile>("/api/connections", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateConnection: (id: string, data: Partial<import("./types").ConnectionProfile>) =>
    request<import("./types").ConnectionProfile>(`/api/connections/${encodePathSegment(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteConnection: (id: string) => request<void>(`/api/connections/${encodePathSegment(id)}`, { method: "DELETE" }),
  testConnection: (data: { hosts: string[]; port: number; username?: string; password?: string }) =>
    request<{ success: boolean; message: string }>("/api/connections/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Cluster
  getCluster: (connId: string) => request<import("./types").ClusterInfo>(`/api/clusters/${encodePathSegment(connId)}`),
  configureNamespace: (connId: string, data: import("./types").ConfigureNamespaceRequest) =>
    request<{ message: string }>(`/api/clusters/${encodePathSegment(connId)}/namespaces`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Records
  getRecords: (connId: string, ns: string, set: string, page = 1, pageSize = 25) =>
    request<import("./types").RecordListResponse>(
      withQuery(`/api/records/${encodePathSegment(connId)}`, { ns, set, page, pageSize }),
    ),
  putRecord: (connId: string, data: import("./types").RecordWriteRequest) =>
    request<import("./types").AerospikeRecord>(`/api/records/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRecord: (connId: string, ns: string, set: string, pk: string) =>
    request<void>(withQuery(`/api/records/${encodePathSegment(connId)}`, { ns, set, pk }), {
      method: "DELETE",
    }),
  getFilteredRecords: (
    connId: string,
    body: import("./types").FilteredQueryRequest,
  ): Promise<import("./types").FilteredQueryResponse> =>
    request<import("./types").FilteredQueryResponse>(`/api/records/${encodePathSegment(connId)}/filter`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Query
  executeQuery: (connId: string, query: import("./types").QueryRequest) =>
    request<import("./types").QueryResponse>(`/api/query/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify(query),
    }),

  // Indexes
  getIndexes: (connId: string) =>
    request<import("./types").SecondaryIndex[]>(`/api/indexes/${encodePathSegment(connId)}`),
  createIndex: (connId: string, data: import("./types").CreateIndexRequest) =>
    request<import("./types").SecondaryIndex>(`/api/indexes/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteIndex: (connId: string, name: string, ns: string) =>
    request<void>(withQuery(`/api/indexes/${encodePathSegment(connId)}`, { name, ns }), {
      method: "DELETE",
    }),

  // Admin
  getUsers: (connId: string) =>
    request<import("./types").AerospikeUser[]>(`/api/admin/${encodePathSegment(connId)}/users`),
  createUser: (connId: string, data: import("./types").CreateUserRequest) =>
    request<import("./types").AerospikeUser>(`/api/admin/${encodePathSegment(connId)}/users`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  changePassword: (connId: string, username: string, password: string) =>
    request<{ message: string }>(`/api/admin/${encodePathSegment(connId)}/users`, {
      method: "PATCH",
      body: JSON.stringify({ username, password }),
    }),
  deleteUser: (connId: string, username: string) =>
    request<void>(withQuery(`/api/admin/${encodePathSegment(connId)}/users`, { username }), {
      method: "DELETE",
    }),
  getRoles: (connId: string) =>
    request<import("./types").AerospikeRole[]>(`/api/admin/${encodePathSegment(connId)}/roles`),
  createRole: (connId: string, data: import("./types").CreateRoleRequest) =>
    request<import("./types").AerospikeRole>(`/api/admin/${encodePathSegment(connId)}/roles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteRole: (connId: string, name: string) =>
    request<void>(withQuery(`/api/admin/${encodePathSegment(connId)}/roles`, { name }), {
      method: "DELETE",
    }),

  // UDFs
  getUDFs: (connId: string) => request<import("./types").UDFModule[]>(`/api/udfs/${encodePathSegment(connId)}`),
  uploadUDF: (connId: string, data: { filename: string; content: string }) =>
    request<import("./types").UDFModule>(`/api/udfs/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteUDF: (connId: string, filename: string) =>
    request<void>(withQuery(`/api/udfs/${encodePathSegment(connId)}`, { filename }), {
      method: "DELETE",
    }),

  // Sample Data
  createSampleData: (connId: string, data: import("./types").CreateSampleDataRequest) =>
    request<import("./types").CreateSampleDataResponse>(`/api/sample-data/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify(data),
      timeout: 60_000,
    }),

  // Terminal
  executeCommand: (connId: string, command: string) =>
    request<import("./types").TerminalCommand>(`/api/terminal/${encodePathSegment(connId)}`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  // Metrics
  getMetrics: (connId: string) =>
    request<import("./types").ClusterMetrics>(`/api/metrics/${encodePathSegment(connId)}`),

  // K8s Clusters
  getK8sClusters: (namespace?: string) =>
    request<import("./types").K8sClusterSummary[]>(
      withQuery("/api/k8s/clusters", { namespace }),
    ),
  getK8sCluster: (namespace: string, name: string) =>
    request<import("./types").K8sClusterDetail>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`),
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
    request<import("./types").K8sClusterSummary>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteK8sCluster: (namespace: string, name: string) =>
    request<void>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`, { method: "DELETE" }),
  scaleK8sCluster: (
    namespace: string,
    name: string,
    data: import("./types").ScaleK8sClusterRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/scale`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getK8sNamespaces: () => request<string[]>("/api/k8s/namespaces"),
  getK8sStorageClasses: () => request<string[]>("/api/k8s/storageclasses"),
  getK8sSecrets: (namespace: string) =>
    request<string[]>(withQuery("/api/k8s/secrets", { namespace })),

  // K8s Templates
  getK8sTemplates: (namespace?: string) =>
    request<import("./types").K8sTemplateSummary[]>(
      withQuery("/api/k8s/templates", { namespace }),
    ),
  getK8sTemplate: (namespace: string, name: string) =>
    request<import("./types").K8sTemplateDetail>(`/api/k8s/templates/${encodePathSegment(namespace)}/${encodePathSegment(name)}`),
  createK8sTemplate: (data: import("./types").CreateK8sTemplateRequest) =>
    request<import("./types").K8sTemplateSummary>("/api/k8s/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteK8sTemplate: (namespace: string, name: string) =>
    request<{ message: string }>(`/api/k8s/templates/${encodePathSegment(namespace)}/${encodePathSegment(name)}`, {
      method: "DELETE",
    }),

  // K8s Template Resync
  resyncK8sClusterTemplate: (namespace: string, name: string) =>
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/resync-template`,
      { method: "POST" },
    ),

  // K8s Cluster Events
  getK8sClusterEvents: (namespace: string, name: string, limit = 50) =>
    request<import("./types").K8sClusterEvent[]>(
      withQuery(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/events`, { limit }),
    ),

  // K8s Cluster Health
  getK8sClusterHealth: (namespace: string, name: string) =>
    request<import("./types").ClusterHealthSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/health`,
    ),

  // K8s Pod Logs
  getK8sPodLogs: (
    namespace: string,
    clusterName: string,
    pod: string,
    tail = 500,
    container?: string,
  ) =>
    request<import("./types").PodLogsResponse>(
      withQuery(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(clusterName)}/pods/${encodePathSegment(pod)}/logs`, {
        tail,
        container,
      }),
    ),

  // K8s Cluster YAML Export
  getK8sClusterYaml: (namespace: string, name: string) =>
    request<import("./types").ClusterYamlResponse>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/yaml`),

  // K8s Nodes
  getK8sNodes: () => request<import("./types").K8sNodeInfo[]>("/api/k8s/nodes"),

  // K8s Cluster Operations
  triggerK8sClusterOperation: (
    namespace: string,
    name: string,
    data: import("./types").OperationRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/operations`,
      { method: "POST", body: JSON.stringify(data) },
    ),
};

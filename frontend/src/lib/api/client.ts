import { ApiError } from "./errors";
import { getErrorMessage } from "@/lib/utils";

const BASE_URL = "";
const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 2;

// API Versioning: The backend now supports both /api/... (backward-compatible)
// and /api/v1/... (versioned) endpoints. All paths below use the unversioned
// /api/... prefix for backward compatibility. When ready to migrate, replace
// "/api/" with "/api/v1/" in the endpoint paths below.
const RETRY_BASE_DELAY = 1000;
const MAX_RETRY_DELAY = 30_000;

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function buildHeaders(
  headersInit: HeadersInit | undefined,
  body: BodyInit | null | undefined,
): Headers {
  const headers = new Headers(headersInit);

  if (!headers.has("X-Request-ID")) {
    headers.set("X-Request-ID", generateRequestId());
  }

  if (body !== undefined && body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

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
  return status >= 500 || status === 429 || status === 408;
}

function isRetryableMethod(method?: string): boolean {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  return (
    normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS"
  );
}

function getRetryDelay(attempt: number, retryAfter: string | null): number {
  if (!retryAfter) {
    return RETRY_BASE_DELAY * 2 ** attempt;
  }

  const seconds = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt)) {
    const delayMs = retryAt - Date.now();
    if (delayMs > 0) {
      return Math.min(delayMs, MAX_RETRY_DELAY);
    }
  }

  return RETRY_BASE_DELAY * 2 ** attempt;
}

const MAX_ERROR_PARSE_DEPTH = 5;

function toErrorMessage(detail: unknown, depth = 0): string | undefined {
  if (depth >= MAX_ERROR_PARSE_DEPTH) return undefined;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => toErrorMessage(item, depth + 1))
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  if (detail && typeof detail === "object") {
    const value = detail as Record<string, unknown>;

    if (typeof value.msg === "string" && value.msg.trim()) {
      return value.msg;
    }

    if (typeof value.message === "string" && value.message.trim()) {
      return value.message;
    }

    if (value.detail !== undefined) {
      return toErrorMessage(value.detail, depth + 1);
    }
  }

  return undefined;
}

async function parseResponseBody<T>(res: Response): Promise<T | undefined> {
  const bodyText = await res.text();

  if (!bodyText.trim()) {
    return undefined;
  }

  return JSON.parse(bodyText) as T;
}

async function request<T>(path: string, options?: RequestInit & { timeout?: number }): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOptions } = options ?? {};
  const method = fetchOptions.method?.toUpperCase() ?? "GET";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const headers = buildHeaders(fetchOptions.headers, fetchOptions.body);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const error = (await parseResponseBody<{
          message?: unknown;
          detail?: unknown;
          code?: string;
        }>(res).catch(() => undefined)) ?? { message: res.statusText };
        const message =
          toErrorMessage(error.message) ??
          toErrorMessage(error.detail) ??
          `Request failed: ${res.status}`;
        const apiError = new ApiError(message, res.status, error.code);

        // Retry only safe/idempotent reads to avoid duplicate write side-effects.
        if (isRetryableMethod(method) && isRetryable(res.status) && attempt < MAX_RETRIES) {
          lastError = apiError;
          const retryAfter =
            typeof res.headers?.get === "function" ? res.headers.get("Retry-After") : null;
          const delay = getRetryDelay(attempt, retryAfter);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        throw apiError;
      }

      if (res.status === 204) {
        return undefined as T;
      }

      try {
        const data = await parseResponseBody<T>(res);
        return data as T;
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new ApiError("Invalid JSON response", res.status);
        }
        throw err;
      }
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) throw err;

      // Retry only safe/idempotent reads to avoid duplicate write side-effects.
      if (
        isRetryableMethod(method) &&
        attempt < MAX_RETRIES &&
        !(err instanceof DOMException && err.name === "AbortError")
      ) {
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
    request<import("./types").ConnectionStatus>(
      `/api/connections/${encodePathSegment(id)}/health`,
      {
        timeout: 10_000,
      },
    ),
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
  deleteConnection: (id: string) =>
    request<void>(`/api/connections/${encodePathSegment(id)}`, { method: "DELETE" }),
  testConnection: (data: { hosts: string[]; port: number; username?: string; password?: string }) =>
    request<{ success: boolean; message: string }>("/api/connections/test", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Cluster
  getCluster: (connId: string) =>
    request<import("./types").ClusterInfo>(`/api/clusters/${encodePathSegment(connId)}`),
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
  getRecord: (connId: string, ns: string, set: string, pk: string) =>
    request<import("./types").AerospikeRecord>(
      withQuery(`/api/records/${encodePathSegment(connId)}/detail`, { ns, set, pk }),
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
    request<import("./types").FilteredQueryResponse>(
      `/api/records/${encodePathSegment(connId)}/filter`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

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
  getUDFs: (connId: string) =>
    request<import("./types").UDFModule[]>(`/api/udfs/${encodePathSegment(connId)}`),
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
    request<import("./types").CreateSampleDataResponse>(
      `/api/sample-data/${encodePathSegment(connId)}`,
      {
        method: "POST",
        body: JSON.stringify(data),
        timeout: 60_000,
      },
    ),

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
    request<import("./types").K8sClusterSummary[]>(withQuery("/api/k8s/clusters", { namespace })),
  getK8sCluster: (namespace: string, name: string) =>
    request<import("./types").K8sClusterDetail>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`,
    ),
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
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    ),
  deleteK8sCluster: (namespace: string, name: string) =>
    request<void>(`/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}`, {
      method: "DELETE",
    }),
  scaleK8sCluster: (
    namespace: string,
    name: string,
    data: import("./types").ScaleK8sClusterRequest,
  ) =>
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/scale`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  getK8sNamespaces: () => request<string[]>("/api/k8s/namespaces"),
  getK8sStorageClasses: () => request<string[]>("/api/k8s/storageclasses"),
  getK8sSecrets: (namespace: string) =>
    request<string[]>(withQuery("/api/k8s/secrets", { namespace })),

  // K8s Templates (cluster-scoped — no namespace)
  getK8sTemplates: () => request<import("./types").K8sTemplateSummary[]>("/api/k8s/templates"),
  getK8sTemplate: (name: string) =>
    request<import("./types").K8sTemplateDetail>(`/api/k8s/templates/${encodePathSegment(name)}`),
  createK8sTemplate: (data: import("./types").CreateK8sTemplateRequest) =>
    request<import("./types").K8sTemplateSummary>("/api/k8s/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteK8sTemplate: (name: string) =>
    request<{ message: string }>(`/api/k8s/templates/${encodePathSegment(name)}`, {
      method: "DELETE",
    }),

  // K8s Template Resync
  resyncK8sClusterTemplate: (namespace: string, name: string) =>
    request<import("./types").K8sClusterSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/resync-template`,
      { method: "POST" },
    ),

  // K8s Cluster Events
  getK8sClusterEvents: (namespace: string, name: string, limit = 50, category?: string) =>
    request<import("./types").K8sClusterEvent[]>(
      withQuery(
        `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/events`,
        { limit, category },
      ),
    ),

  // K8s Cluster Health
  getK8sClusterHealth: (namespace: string, name: string) =>
    request<import("./types").ClusterHealthSummary>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/health`,
    ),

  // K8s Config Drift
  getK8sClusterConfigDrift: (namespace: string, name: string) =>
    request<import("./types").ConfigDriftResponse>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/config-drift`,
    ),

  // K8s Reconciliation Status
  getK8sReconciliationStatus: (namespace: string, name: string) =>
    request<import("./types").ReconciliationStatus>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/reconciliation-status`,
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
      withQuery(
        `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(clusterName)}/pods/${encodePathSegment(pod)}/logs`,
        {
          tail,
          container,
        },
      ),
    ),

  // K8s Cluster YAML Export
  getK8sClusterYaml: (namespace: string, name: string) =>
    request<import("./types").ClusterYamlResponse>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/yaml`,
    ),

  // K8s Nodes
  getK8sNodes: () => request<import("./types").K8sNodeInfo[]>("/api/k8s/nodes"),

  // K8s Cluster HPA
  getK8sClusterHPA: (namespace: string, name: string) =>
    request<import("./types").HPAResponse>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/hpa`,
    ),
  createK8sClusterHPA: (namespace: string, name: string, data: import("./types").HPAConfig) =>
    request<import("./types").HPAResponse>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/hpa`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),
  deleteK8sClusterHPA: (namespace: string, name: string) =>
    request<{ message: string }>(
      `/api/k8s/clusters/${encodePathSegment(namespace)}/${encodePathSegment(name)}/hpa`,
      { method: "DELETE" },
    ),

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

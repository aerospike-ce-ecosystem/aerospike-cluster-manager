/**
 * Minimal typed fetch client for the backend REST API.
 *
 * Behaviour:
 *   - Prefixes all paths with `/api` (mounted on both `/api/*` and `/api/v1/*`
 *     in the backend — we use `/api` for backward compatibility by default).
 *   - Default JSON Content-Type and Accept headers.
 *   - Timeout via AbortController (default 30s).
 *   - Throws `ApiError` on non-2xx with status + parsed body (when JSON).
 *   - 204 No Content returns `undefined as T`.
 */

export const API_PREFIX = "/api";
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface ApiErrorBody {
  detail?: string | unknown;
  [k: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | string | null;

  constructor(status: number, message: string, body: ApiErrorBody | string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** Convenience — extract a human-readable detail message. */
  get detail(): string {
    if (typeof this.body === "string") return this.body;
    if (this.body && typeof this.body === "object") {
      const d = (this.body as ApiErrorBody).detail;
      if (typeof d === "string") return d;
      if (d != null) return JSON.stringify(d);
    }
    return this.message;
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** JSON-serializable body. Overrides RequestInit.body. */
  json?: unknown;
  /** Request timeout in milliseconds (default 30s). */
  timeoutMs?: number;
  /** Query params to append to the URL. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Replace Content-Type / Accept — otherwise defaults to application/json. */
  headers?: HeadersInit;
}

function buildUrl(
  path: string,
  query?: ApiRequestInit["query"],
): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const full = base.startsWith(API_PREFIX) ? base : `${API_PREFIX}${base}`;
  if (!query) return full;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${full}?${qs}` : full;
}

export async function apiFetch<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const { json, timeoutMs = DEFAULT_TIMEOUT_MS, query, headers, signal, ...rest } = init;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Chain caller signal so either can abort the request.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json");
  if (json !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, `Request aborted or timed out after ${timeoutMs}ms`, null);
    }
    throw new ApiError(0, err instanceof Error ? err.message : "Network error", null);
  }
  clearTimeout(timeoutId);

  if (response.status === 204 || response.status === 202) {
    // 202 responses (e.g. K8s delete) may carry an optional body.
    if (response.status === 204) return undefined as T;
    // Try to parse if JSON, otherwise return undefined.
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let body: ApiErrorBody | string | null = null;
    try {
      body = isJson ? ((await response.json()) as ApiErrorBody) : await response.text();
    } catch {
      body = null;
    }
    const message =
      (body && typeof body === "object" && typeof body.detail === "string"
        ? body.detail
        : response.statusText) || `HTTP ${response.status}`;
    throw new ApiError(response.status, message, body);
  }

  if (!isJson) {
    // Fall back to text for unexpected content types.
    return (await response.text()) as unknown as T;
  }
  return (await response.json()) as T;
}

// -- Verb wrappers --------------------------------------------------------

export function apiGet<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "POST", json: body });
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "PUT", json: body });
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "PATCH", json: body });
}

export function apiDelete<T = void>(path: string, init?: ApiRequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "DELETE" });
}

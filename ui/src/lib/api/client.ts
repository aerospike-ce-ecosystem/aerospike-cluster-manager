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
 *
 * Multi-cluster + OIDC behaviour (web-only mode):
 *   - When the cluster registry has loaded (cluster-selector-store), requests
 *     are sent to the active cluster's `apiUrl` (cross-origin). Otherwise the
 *     legacy single-API_URL relative path is used (proxy.js / next rewrites).
 *   - When an access token is present (auth-store), `Authorization: Bearer`
 *     is added automatically.
 *   - 401 responses trigger one silent refresh attempt; the original request
 *     is retried once if refresh succeeds.
 */

import { useAuthStore } from "@/stores/auth-store"
import {
  getActiveApiUrl,
  useClusterSelectorStore,
} from "@/stores/cluster-selector-store"

export const API_PREFIX = "/api"
export const DEFAULT_TIMEOUT_MS = 30_000

export interface ApiErrorBody {
  detail?: string | unknown
  [k: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly body: ApiErrorBody | string | null

  constructor(
    status: number,
    message: string,
    body: ApiErrorBody | string | null,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }

  /** Convenience — extract a human-readable detail message. */
  get detail(): string {
    if (typeof this.body === "string") return this.body
    if (this.body && typeof this.body === "object") {
      const d = (this.body as ApiErrorBody).detail
      if (typeof d === "string") return d
      if (d != null) return JSON.stringify(d)
    }
    return this.message
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** JSON-serializable body. Overrides RequestInit.body. */
  json?: unknown
  /** Request timeout in milliseconds (default 30s). */
  timeoutMs?: number
  /** Query params to append to the URL. */
  query?: Record<string, string | number | boolean | null | undefined>
  /** Replace Content-Type / Accept — otherwise defaults to application/json. */
  headers?: HeadersInit
}

function buildUrl(path: string, query?: ApiRequestInit["query"]): string {
  const base = path.startsWith("/") ? path : `/${path}`
  const full = base.startsWith(API_PREFIX) ? base : `${API_PREFIX}${base}`

  // Multi-cluster mode: registry hydrated → prepend the selected cluster's
  // apiUrl (cross-origin). Single-cluster mode: leave as relative so
  // existing proxy / next.rewrites continues to work.
  const apiBase = getActiveApiUrl()
  const withBase = apiBase ? `${apiBase.replace(/\/+$/, "")}${full}` : full

  if (!query) return withBase
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${withBase}?${qs}` : withBase
}

/** Lazy, cycle-safe import of the keycloak helpers. The auth module pulls in
 *  the auth store, which already imports from this client; resolving it via
 *  dynamic import on demand keeps both sides happy and avoids dragging
 *  keycloak-js into SSR bundles for routes that never call apiFetch. */
async function attemptTokenRefresh(): Promise<string | undefined> {
  try {
    const mod = await import("@/lib/auth/keycloak")
    return await mod.refreshToken(30)
  } catch {
    return undefined
  }
}

async function redirectToLogin(): Promise<void> {
  try {
    const mod = await import("@/lib/auth/keycloak")
    await mod.login()
  } catch {
    // If keycloak hasn't initialised, surface the 401 to the caller instead
    // of silently failing — they'll get an ApiError(401) from the original
    // response and can render a sign-in prompt.
  }
}

async function executeRequest(
  url: string,
  init: ApiRequestInit,
  attachAuth: boolean,
): Promise<Response> {
  const {
    json,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    signal,
    query: _query, // already baked into url
    ...rest
  } = init
  void _query

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  if (signal) {
    if (signal.aborted) controller.abort()
    else
      signal.addEventListener("abort", () => controller.abort(), { once: true })
  }

  const finalHeaders = new Headers(headers)
  if (!finalHeaders.has("Accept"))
    finalHeaders.set("Accept", "application/json")
  if (json !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json")
  }
  if (attachAuth && !finalHeaders.has("Authorization")) {
    const token = useAuthStore.getState().accessToken
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`)
  }

  try {
    return await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body:
        json !== undefined ? JSON.stringify(json) : (rest as RequestInit).body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function apiFetch<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const url = buildUrl(path, init.query)
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let response: Response
  try {
    response = await executeRequest(url, init, true)
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        0,
        `Request aborted or timed out after ${timeoutMs}ms`,
        null,
      )
    }
    throw new ApiError(
      0,
      err instanceof Error ? err.message : "Network error",
      null,
    )
  }

  // 401 → silent refresh + single retry. We only retry once per request to
  // avoid loops if the IdP keeps issuing tokens the API rejects.
  if (response.status === 401 && useClusterSelectorStore.getState().registry) {
    const newToken = await attemptTokenRefresh()
    if (newToken) {
      try {
        response = await executeRequest(url, init, true)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new ApiError(
            0,
            `Request aborted or timed out after ${timeoutMs}ms`,
            null,
          )
        }
        throw new ApiError(
          0,
          err instanceof Error ? err.message : "Network error",
          null,
        )
      }
    }
    if (response.status === 401) {
      // Permanent failure → kick off login redirect; throw so caller sees it.
      void redirectToLogin()
    }
  }

  if (response.status === 204 || response.status === 202) {
    if (response.status === 204) return undefined as T
    const text = await response.text()
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      return undefined as T
    }
  }

  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")

  if (!response.ok) {
    let body: ApiErrorBody | string | null = null
    try {
      body = isJson
        ? ((await response.json()) as ApiErrorBody)
        : await response.text()
    } catch {
      body = null
    }
    const message =
      (body && typeof body === "object" && typeof body.detail === "string"
        ? body.detail
        : response.statusText) || `HTTP ${response.status}`
    throw new ApiError(response.status, message, body)
  }

  if (!isJson) {
    return (await response.text()) as unknown as T
  }
  return (await response.json()) as T
}

// -- Verb wrappers --------------------------------------------------------

export function apiGet<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "GET" })
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "POST", json: body })
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "PUT", json: body })
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "PATCH", json: body })
}

export function apiDelete<T = void>(
  path: string,
  init?: ApiRequestInit,
): Promise<T> {
  return apiFetch<T>(path, { ...init, method: "DELETE" })
}

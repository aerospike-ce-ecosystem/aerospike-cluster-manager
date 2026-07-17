/**
 * subscribeEvents — SSE ticket handshake (issue #345).
 *
 * The JWT must never appear in the stream URL. When an access token is
 * present, the client first mints a single-use ticket via an authenticated
 * POST /api/events/ticket, then opens the EventSource with ?ticket=<opaque>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/stores/auth-store"
import {
  useClusterSelectorStore,
  type ClusterRegistry,
} from "@/stores/cluster-selector-store"

import { subscribeEvents } from "./events"

// keycloak-js pulls browser-crypto paths we don't want in unit tests; the
// refresh path is exercised via this mock instead.
vi.mock("@/lib/auth/keycloak", () => ({
  refreshToken: vi.fn(),
}))

import { refreshToken } from "@/lib/auth/keycloak"

const refreshTokenMock = vi.mocked(refreshToken)

// ---------------------------------------------------------------------------
// EventSource mock — jsdom does not implement EventSource.
// ---------------------------------------------------------------------------

class MockEventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  static instances: MockEventSource[] = []

  url: string
  readyState = MockEventSource.CONNECTING
  listeners = new Map<string, Array<(ev: Event) => void>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, cb: (ev: Event) => void) {
    const arr = this.listeners.get(type) ?? []
    arr.push(cb)
    this.listeners.set(type, arr)
  }

  close() {
    this.readyState = MockEventSource.CLOSED
  }

  emit(type: string, ev: Event) {
    for (const cb of this.listeners.get(type) ?? []) cb(ev)
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Flush the event loop so subscribeEvents' async open settles. Each
 *  setTimeout(0) turn drains all pending microtasks (fetch/json chains). */
async function flush(turns = 3): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const REGISTRY: ClusterRegistry = {
  defaultClusterId: "dev",
  clusters: [
    {
      id: "dev",
      displayName: "Dev",
      apiUrl: "https://dev-api.example.com",
    },
  ],
}

const JWT = "eyJ.fake.jwt-token"

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  MockEventSource.instances = []
  vi.stubGlobal("EventSource", MockEventSource)
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  refreshTokenMock.mockReset()
  refreshTokenMock.mockResolvedValue(undefined)
  useAuthStore.setState({ accessToken: null, claims: null, refreshing: false })
  useClusterSelectorStore.setState({
    registry: null,
    currentClusterId: null,
    registryError: null,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("subscribeEvents — no auth token", () => {
  it("connects directly without minting a ticket", async () => {
    const sub = subscribeEvents()
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(MockEventSource.instances).toHaveLength(1)
    const url = MockEventSource.instances[0].url
    expect(url).toBe("/api/events/stream")
    sub.close()
  })

  it("appends types and the active cluster id", async () => {
    useClusterSelectorStore.setState({
      registry: REGISTRY,
      currentClusterId: "dev",
      registryError: null,
    })
    const sub = subscribeEvents({ types: ["cluster.status", "pod.status"] })
    await flush()

    const url = new URL(MockEventSource.instances[0].url)
    expect(url.origin).toBe("https://dev-api.example.com")
    expect(url.pathname).toBe("/api/events/stream")
    expect(url.searchParams.get("types")).toBe("cluster.status,pod.status")
    expect(url.searchParams.get("cluster")).toBe("dev")
    expect(url.searchParams.has("ticket")).toBe(false)
    sub.close()
  })
})

describe("subscribeEvents — OIDC ticket handshake", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: JWT,
      claims: null,
      refreshing: false,
    })
    useClusterSelectorStore.setState({
      registry: REGISTRY,
      currentClusterId: "dev",
      registryError: null,
    })
  })

  it("mints a ticket via authenticated POST, then connects with ?ticket=", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ticket: "tkt-opaque-1", expires_in: 30 }),
    )

    const sub = subscribeEvents({ types: ["cluster.status"] })
    await flush()

    // Mint call: POST to the ticket endpoint with the Authorization header.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [mintUrl, mintInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(mintUrl).toBe("https://dev-api.example.com/api/events/ticket")
    expect(mintInit.method).toBe("POST")
    expect(new Headers(mintInit.headers).get("Authorization")).toBe(
      `Bearer ${JWT}`,
    )

    // Stream URL carries the opaque ticket — and NEVER the JWT.
    expect(MockEventSource.instances).toHaveLength(1)
    const url = new URL(MockEventSource.instances[0].url)
    expect(url.searchParams.get("ticket")).toBe("tkt-opaque-1")
    expect(url.searchParams.has("access_token")).toBe(false)
    expect(MockEventSource.instances[0].url).not.toContain(JWT)
    sub.close()
  })

  it("does not open the stream when the mint is rejected and refresh fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "expired" }, 401))
    refreshTokenMock.mockResolvedValue(undefined)
    const onError = vi.fn()

    const sub = subscribeEvents({ onError })
    await flush()

    expect(MockEventSource.instances).toHaveLength(0)
    expect(onError).toHaveBeenCalled()
    sub.close()
  })

  it("refreshes the token once and retries the mint when the first mint fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ticket: "tkt-2", expires_in: 30 }))
    refreshTokenMock.mockResolvedValue("new-jwt")

    const sub = subscribeEvents()
    await flush()

    expect(refreshTokenMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(new Headers(secondInit.headers).get("Authorization")).toBe(
      "Bearer new-jwt",
    )
    expect(MockEventSource.instances).toHaveLength(1)
    expect(
      new URL(MockEventSource.instances[0].url).searchParams.get("ticket"),
    ).toBe("tkt-2")
    sub.close()
  })

  it("mints a fresh single-use ticket on auth-driven reconnect", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ticket: "tkt-a", expires_in: 30 }))
      .mockResolvedValueOnce(jsonResponse({ ticket: "tkt-b", expires_in: 30 }))
    refreshTokenMock.mockResolvedValue("refreshed-jwt")

    const sub = subscribeEvents()
    await flush()
    expect(MockEventSource.instances).toHaveLength(1)
    const first = MockEventSource.instances[0]
    expect(new URL(first.url).searchParams.get("ticket")).toBe("tkt-a")

    // Server hard-rejects (e.g. burned ticket after a proxy retry): the
    // stream lands in CLOSED and the client reopens with a NEW ticket.
    first.readyState = MockEventSource.CLOSED
    first.emit("error", new Event("error"))
    await flush()

    expect(MockEventSource.instances).toHaveLength(2)
    const second = MockEventSource.instances[1]
    expect(new URL(second.url).searchParams.get("ticket")).toBe("tkt-b")
    expect(second.url).not.toContain("tkt-a")
    sub.close()
  })
})

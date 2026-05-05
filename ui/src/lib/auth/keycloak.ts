/**
 * Keycloak (OIDC PKCE) bootstrap module.
 *
 * The web pod ships a static `/web-oidc-config.json` (mounted from a ConfigMap
 * by Stream A's chart). On boot we fetch it, split the OIDC issuer URL of the
 * form `https://kc/realms/acko` into `{ url: "https://kc", realm: "acko" }`,
 * and instantiate the singleton Keycloak client.
 *
 * Tokens are kept in-memory only (mirrored into auth-store). We deliberately
 * avoid persisting them to localStorage to keep the XSS blast radius small.
 */

"use client"

import KeycloakImport, {
  type KeycloakConfig,
  type KeycloakInstance,
} from "keycloak-js"

import { useAuthStore } from "@/stores/auth-store"

const KeycloakCtor = (KeycloakImport as unknown) as typeof KeycloakImport &
  ((config: KeycloakConfig) => KeycloakInstance)

export interface WebOidcConfig {
  /** Full OIDC issuer URL — `${url}/realms/${realm}`. */
  issuerUrl: string
  clientId: string
  redirectUri?: string
  scopes?: string[]
}

let keycloak: KeycloakInstance | null = null
let initPromise: Promise<KeycloakInstance> | null = null
let oidcConfig: WebOidcConfig | null = null

const OIDC_CONFIG_PATH = "/web-oidc-config.json"

/**
 * Split an OIDC issuer URL into Keycloak base url + realm.
 * Accepts both `https://kc.example.com/realms/acko` and trailing-slash forms.
 */
export function splitIssuerUrl(issuerUrl: string): {
  url: string
  realm: string
} {
  const cleaned = issuerUrl.replace(/\/+$/, "")
  const match = cleaned.match(/^(.*)\/realms\/([^/]+)$/)
  if (!match) {
    throw new Error(
      `Invalid OIDC issuerUrl: expected '<base>/realms/<realm>' (got '${issuerUrl}')`,
    )
  }
  return { url: match[1], realm: match[2] }
}

async function fetchOidcConfig(): Promise<WebOidcConfig> {
  if (oidcConfig) return oidcConfig
  const res = await fetch(OIDC_CONFIG_PATH, {
    cache: "no-store",
    credentials: "omit",
  })
  if (!res.ok) {
    throw new Error(
      `Failed to load ${OIDC_CONFIG_PATH}: ${res.status} ${res.statusText}`,
    )
  }
  const data = (await res.json()) as WebOidcConfig
  if (!data.issuerUrl || !data.clientId) {
    throw new Error(
      `${OIDC_CONFIG_PATH} is missing required fields (issuerUrl/clientId)`,
    )
  }
  oidcConfig = data
  return data
}

function syncTokenToStore(kc: KeycloakInstance) {
  const store = useAuthStore.getState()
  if (kc.authenticated && kc.token) {
    store.setToken(kc.token, kc.tokenParsed ?? null)
  } else {
    store.clear()
  }
}

/**
 * Initialise Keycloak with `check-sso` + PKCE S256. Idempotent — repeated
 * callers get the same in-flight or settled promise.
 */
export function initKeycloak(): Promise<KeycloakInstance> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const cfg = await fetchOidcConfig()
    const { url, realm } = splitIssuerUrl(cfg.issuerUrl)

    const kc = new KeycloakCtor({
      url,
      realm,
      clientId: cfg.clientId,
    })

    kc.onTokenExpired = () => {
      // Best-effort silent refresh, 30s of life left.
      kc.updateToken(30)
        .then(() => syncTokenToStore(kc))
        .catch(() => {
          useAuthStore.getState().clear()
        })
    }
    kc.onAuthSuccess = () => syncTokenToStore(kc)
    kc.onAuthRefreshSuccess = () => syncTokenToStore(kc)
    kc.onAuthLogout = () => useAuthStore.getState().clear()

    await kc.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      silentCheckSsoRedirectUri:
        typeof window !== "undefined"
          ? `${window.location.origin}/silent-check-sso.html`
          : undefined,
      checkLoginIframe: false,
    })

    syncTokenToStore(kc)

    keycloak = kc
    return kc
  })()

  return initPromise
}

export function getKeycloak(): KeycloakInstance | null {
  return keycloak
}

export function getToken(): string | undefined {
  return keycloak?.token ?? undefined
}

export async function login(redirectUri?: string): Promise<void> {
  const kc = keycloak ?? (await initKeycloak())
  await kc.login({ redirectUri })
}

export async function logout(redirectUri?: string): Promise<void> {
  const kc = keycloak ?? (await initKeycloak())
  await kc.logout({ redirectUri })
}

/**
 * Try to refresh the access token, returning the new token on success.
 * Falls back to redirecting to login on permanent failure.
 */
export async function refreshToken(
  minValiditySeconds = 30,
): Promise<string | undefined> {
  if (!keycloak) return undefined
  const store = useAuthStore.getState()
  store.setRefreshing(true)
  try {
    await keycloak.updateToken(minValiditySeconds)
    syncTokenToStore(keycloak)
    return keycloak.token ?? undefined
  } catch {
    store.clear()
    return undefined
  } finally {
    useAuthStore.getState().setRefreshing(false)
  }
}

/** Reset internal state — testing only. */
export function __resetKeycloakForTests(): void {
  keycloak = null
  initPromise = null
  oidcConfig = null
}

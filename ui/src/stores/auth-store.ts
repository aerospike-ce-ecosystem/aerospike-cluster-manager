/**
 * Auth store — in-memory only.
 *
 * No `persist` middleware: access tokens never touch localStorage. Token
 * lifecycle is owned by `lib/auth/keycloak.ts`; this store mirrors the
 * current value so React components can subscribe via the Zustand selector
 * without reaching into the Keycloak singleton.
 */

import { create } from "zustand"

export interface AuthClaims {
  sub?: string
  email?: string
  preferred_username?: string
  name?: string
  realm_access?: { roles?: string[] }
  resource_access?: Record<string, { roles?: string[] }>
  exp?: number
  [k: string]: unknown
}

interface AuthStore {
  accessToken: string | null
  claims: AuthClaims | null
  refreshing: boolean

  setToken: (token: string, claims: AuthClaims | null) => void
  setRefreshing: (refreshing: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  accessToken: null,
  claims: null,
  refreshing: false,

  setToken: (accessToken, claims) => set({ accessToken, claims }),
  setRefreshing: (refreshing) => set({ refreshing }),
  clear: () => set({ accessToken: null, claims: null, refreshing: false }),
}))

/** Read realm roles from the cached claims. */
export function getRealmRoles(): string[] {
  const claims = useAuthStore.getState().claims
  return claims?.realm_access?.roles ?? []
}

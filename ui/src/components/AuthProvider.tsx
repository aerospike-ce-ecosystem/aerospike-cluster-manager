"use client"

import * as React from "react"

import { initKeycloak } from "@/lib/auth/keycloak"
import {
  hydrateClusterRegistry,
  useClusterSelectorStore,
} from "@/stores/cluster-selector-store"
import { useAuthStore } from "@/stores/auth-store"

type BootState = "loading" | "single-cluster" | "ready" | "error"

const PUBLIC_PATHS = new Set<string>(["/silent-check-sso.html"])

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return false
}

/**
 * Boots OIDC + cluster registry. Behaviour:
 *   1. Try to fetch /cluster-registry.json. If absent (404) we're in legacy
 *      single-cluster mode → render children unchanged.
 *   2. Try to fetch /web-oidc-config.json + initKeycloak. If absent we
 *      assume the deployment hasn't enabled auth yet → render children.
 *   3. If both registry and OIDC are present and the user is not
 *      authenticated, redirect to login.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<BootState>("loading")
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const accessToken = useAuthStore((s) => s.accessToken)
  const registry = useClusterSelectorStore((s) => s.registry)

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      // 1. Hydrate cluster registry (multi-cluster mode signal).
      let hasRegistry = false
      try {
        await hydrateClusterRegistry()
        hasRegistry = true
      } catch {
        hasRegistry = false
      }
      if (cancelled) return

      if (!hasRegistry) {
        // No /cluster-registry.json → legacy single-API_URL mode. Skip OIDC.
        setState("single-cluster")
        return
      }

      // 2. Initialise Keycloak. If config is missing, surface as error.
      try {
        const kc = await initKeycloak()
        if (cancelled) return
        if (!kc.authenticated) {
          if (typeof window !== "undefined") {
            const path = window.location.pathname
            if (!isPublicPath(path)) {
              await kc.login({
                redirectUri: window.location.href,
              })
              return
            }
          }
        }
        setState("ready")
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setState("error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            aria-label="Loading"
            className="size-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Signing you in…
          </p>
        </div>
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">Authentication unavailable</p>
          <p className="mt-1">{errorMsg ?? "Failed to initialise sign-in."}</p>
        </div>
      </div>
    )
  }

  if (state === "ready" && registry && !accessToken) {
    // Edge case: Keycloak resolved but no token in store yet (race during
    // login redirect). Render the loading shell rather than a blank page.
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
      </div>
    )
  }

  return <>{children}</>
}

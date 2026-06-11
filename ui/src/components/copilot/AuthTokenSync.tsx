"use client"

/**
 * Keeps the copilot runtime requests authenticated across Keycloak token
 * rotation. lib/auth/keycloak.ts refreshes the token into auth-store; this
 * component mirrors every rotation into the CopilotKit transport headers
 * (the documented imperative setHeaders pattern for rotating tokens).
 */

import { useCopilotKit } from "@copilotkit/react-core/v2"
import * as React from "react"

import { useAuthStore } from "@/stores/auth-store"

export function AuthTokenSync() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const { copilotkit } = useCopilotKit()

  React.useEffect(() => {
    // setHeaders replaces the whole header set, so passing {} on logout
    // drops the stale Authorization header instead of letting copilot
    // requests keep sending a token the user just revoked.
    copilotkit.setHeaders(
      accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    )
  }, [copilotkit, accessToken])

  return null
}

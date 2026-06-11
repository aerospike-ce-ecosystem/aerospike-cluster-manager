"use client"

/**
 * The CopilotKit-bearing subtree, loaded only when /copilot-config reports
 * the feature enabled. Mounts the provider, the floating chat popup, and all
 * tool/context/suggestion registrations.
 */

import { CopilotKit, CopilotSidebar } from "@copilotkit/react-core/v2"
import * as React from "react"

import { logCopilotError } from "@/lib/copilot/log"
import { useAuthStore } from "@/stores/auth-store"

import { AuthTokenSync } from "./AuthTokenSync"
import { CopilotAppContext } from "./CopilotAppContext"
import { CopilotSuggestions } from "./CopilotSuggestions"
import { CopilotReadTools } from "./tools/read-tools"
import { CopilotRenderTools } from "./tools/render-tools"

/**
 * Loads the CopilotKit stylesheet as a static asset (copied to public/ by
 * scripts/copy-copilot-css.mjs) — see that script for why it must bypass
 * the Tailwind v3 PostCSS pipeline. Mounted only when the copilot is
 * enabled, so disabled deployments never download it.
 */
function CopilotStylesheet() {
  React.useEffect(() => {
    const id = "copilot-styles"
    if (document.getElementById(id)) return
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href = "/copilot/copilot-styles.css"
    document.head.appendChild(link)
    // Remove only the link this mount created, so toggling the copilot off
    // and on doesn't accumulate stylesheets.
    return () => {
      link.remove()
    }
  }, [])
  return null
}

export function CopilotShell({ children }: { children: React.ReactNode }) {
  // Initial header snapshot; rotation is handled by AuthTokenSync.
  const initialToken = React.useRef(useAuthStore.getState().accessToken)
  const headers = React.useMemo<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    if (initialToken.current) {
      initial.Authorization = `Bearer ${initialToken.current}`
    }
    return initial
  }, [])

  return (
    <CopilotKit
      runtimeUrl="/copilotkit"
      // REQUIRED with our multi-route server handler: the CopilotKit bridge
      // component defaults useSingleEndpoint to true, which makes every
      // request POST to the bare /copilotkit path (single-endpoint
      // envelope) and 404 against the multi-route runtime.
      useSingleEndpoint={false}
      headers={headers}
      showDevConsole={false}
      // Unset, the inspector auto-mounts on localhost and pulls remote
      // CopilotKit announcements — never appropriate for this admin UI.
      enableInspector={false}
      onError={logCopilotError}
    >
      <CopilotStylesheet />
      <AuthTokenSync />
      <CopilotAppContext />
      <CopilotSuggestions />
      <CopilotReadTools />
      <CopilotRenderTools />
      {children}
      <CopilotSidebar
        width={440}
        labels={{
          modalHeaderTitle: "ACKO Agent",
          chatInputPlaceholder: "Ask ACKO Agent about your Aerospike clusters…",
        }}
      />
    </CopilotKit>
  )
}

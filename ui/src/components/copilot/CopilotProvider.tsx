"use client"

/**
 * Feature gate for the embedded AI copilot.
 *
 * Probes /copilot-config once; unless the deployment explicitly enables the
 * copilot (LLM model + key configured on the web container), children render
 * untouched — no CopilotKit provider, no chat button, no extra network calls.
 * The CopilotKit-bearing subtree is code-split via next/dynamic so disabled
 * deployments pay ~0 extra JS.
 */

import dynamic from "next/dynamic"
import * as React from "react"

const CopilotShell = dynamic(
  () => import("./CopilotShell").then((mod) => mod.CopilotShell),
  { ssr: false },
)

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/copilot-config", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((config: { enabled?: boolean }) => setEnabled(!!config.enabled))
      .catch(() => setEnabled(false))
    return () => controller.abort()
  }, [])

  if (!enabled) return <>{children}</>
  return <CopilotShell>{children}</CopilotShell>
}

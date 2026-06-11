"use client"

/**
 * Page-aware suggestion pills shown before the first message. Static per
 * route (no extra LLM calls) — keyed to where the user is in the app.
 */

import { useConfigureSuggestions } from "@copilotkit/react-core/v2"
import { usePathname } from "next/navigation"

function suggestionsFor(pathname: string) {
  if (pathname.startsWith("/acko")) {
    return [
      {
        title: "K8s cluster health",
        message: "How do I check the health of my ACKO-managed clusters?",
      },
      {
        title: "CE limits",
        message: "What are the Community Edition limits I should know about?",
      },
    ]
  }
  if (/^\/clusters\/[^/]+/.test(pathname)) {
    return [
      {
        title: "Cluster health",
        message: "Is the currently selected cluster healthy?",
      },
      {
        title: "Browse a set",
        message: "Show me a few records from a set in this cluster.",
      },
      {
        title: "Build a query",
        message: "Help me query records by a bin value in this cluster.",
      },
    ]
  }
  return [
    {
      title: "Check my clusters",
      message: "List my connections and check whether they are healthy.",
    },
    {
      title: "CE limits",
      message: "What are the Community Edition limits I should know about?",
    },
  ]
}

export function CopilotSuggestions() {
  const pathname = usePathname()

  useConfigureSuggestions(
    {
      suggestions: suggestionsFor(pathname),
      available: "before-first-message",
    },
    [pathname],
  )

  return null
}

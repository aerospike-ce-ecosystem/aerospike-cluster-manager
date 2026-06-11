"use client"

/**
 * Page-aware suggestion pills shown before the first message. Static per
 * route (no extra LLM calls) — keyed to where the user is in the app.
 */

import { useConfigureSuggestions } from "@copilotkit/react-core/v2"
import { usePathname } from "next/navigation"

const CREATE_CLUSTER = {
  title: "Create an ACKO cluster",
  message:
    "I want to create a new Aerospike cluster on Kubernetes via ACKO. " +
    "Walk me through what I need to decide (size, namespaces, CE limits) " +
    "and where to do it.",
}

const EXPLAIN_SAMPLE_SET = {
  title: "Explain sample_set",
  message:
    "Describe the data stored in the sample_set set: which bins exist, " +
    "their types, and a few example records.",
}

const CE_LIMITS = {
  title: "CE limits",
  message: "What are the Community Edition limits I should know about?",
}

function suggestionsFor(pathname: string) {
  if (pathname.startsWith("/acko")) {
    return [
      {
        title: "K8s cluster health",
        message: "How do I check the health of my ACKO-managed clusters?",
      },
      CREATE_CLUSTER,
      CE_LIMITS,
    ]
  }
  if (/^\/clusters\/[^/]+/.test(pathname) && pathname !== "/clusters/new") {
    return [
      {
        title: "Cluster health",
        message: "Is the currently selected cluster healthy?",
      },
      EXPLAIN_SAMPLE_SET,
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
    CREATE_CLUSTER,
    EXPLAIN_SAMPLE_SET,
    CE_LIMITS,
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

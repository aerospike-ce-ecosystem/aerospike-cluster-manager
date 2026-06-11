"use client"

/**
 * Shares the user's current position in the app with the copilot on every
 * run: which connection is selected and which page is open. Lets the model
 * resolve "this cluster" / "this set" without asking.
 */

import { useAgentContext } from "@copilotkit/react-core/v2"
import { usePathname } from "next/navigation"

import { useConnectionStore } from "@/stores/connection-store"

export function CopilotAppContext() {
  const pathname = usePathname()
  const currentConnId = useConnectionStore((state) => state.currentConnId)
  const connections = useConnectionStore((state) => state.connections)
  const current = connections.find((conn) => conn.id === currentConnId)

  useAgentContext({
    description:
      "The user's current location in the Aerospike Cluster Manager UI and " +
      "the currently selected connection",
    value: {
      route: pathname,
      selectedConnectionId: currentConnId,
      selectedConnectionName: current?.name ?? null,
    },
  })

  return null
}

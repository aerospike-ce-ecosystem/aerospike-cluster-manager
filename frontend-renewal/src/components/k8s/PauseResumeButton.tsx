"use client"

import { RiPauseLine, RiPlayLine } from "@remixicon/react"
import { useState } from "react"

import { Button } from "@/components/Button"
import { updateK8sCluster } from "@/lib/api/k8s"

interface PauseResumeButtonProps {
  namespace: string
  name: string
  phase: string
  disabled?: boolean
  onDone?: () => void
  onError?: (msg: string) => void
}

export function PauseResumeButton({
  namespace,
  name,
  phase,
  disabled,
  onDone,
  onError,
}: PauseResumeButtonProps) {
  const [loading, setLoading] = useState(false)
  const isPaused = phase === "Paused"

  const run = async (paused: boolean) => {
    setLoading(true)
    try {
      await updateK8sCluster(namespace, name, { paused })
      onDone?.()
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (isPaused) {
    return (
      <Button
        variant="secondary"
        onClick={() => void run(false)}
        disabled={disabled || loading}
        isLoading={loading}
        className="gap-1"
      >
        <RiPlayLine aria-hidden="true" className="size-4" />
        Resume
      </Button>
    )
  }

  return (
    <Button
      variant="secondary"
      onClick={() => void run(true)}
      disabled={disabled || loading}
      isLoading={loading}
      className="gap-1"
    >
      <RiPauseLine aria-hidden="true" className="size-4" />
      Pause
    </Button>
  )
}

"use client"

import React from "react"

import type { WorkspaceResponse } from "@/lib/types/workspace"

export interface WorkspaceFormState {
  name: string
  color: string
  description: string
}

export interface ParsedWorkspacePayload {
  name: string
  color: string
  description: string | null
}

export const DEFAULT_WORKSPACE_COLOR = "#6366F1"

const EMPTY_FORM: WorkspaceFormState = {
  name: "",
  color: DEFAULT_WORKSPACE_COLOR,
  description: "",
}

export function fromWorkspace(ws: WorkspaceResponse): WorkspaceFormState {
  return {
    name: ws.name,
    color: ws.color,
    description: ws.description ?? "",
  }
}

/**
 * Shared state + validation for Add / Edit Workspace dialogs.
 *
 * - ``form`` / ``setForm``: form state.
 * - ``validate``: returns either ``{ ok: true, payload }`` or ``{ ok: false, error }``.
 * - ``reset``: restore defaults (used by Add dialog after submit).
 * - ``hydrate``: replace the entire form (used by Edit dialog when a different
 *   workspace is opened).
 */
export function useWorkspaceForm(initial?: WorkspaceFormState) {
  const [form, setForm] = React.useState<WorkspaceFormState>(
    initial ?? EMPTY_FORM,
  )

  const reset = React.useCallback(() => setForm(EMPTY_FORM), [])
  const hydrate = React.useCallback(
    (next: WorkspaceFormState) => setForm(next),
    [],
  )

  const validate = React.useCallback(():
    | { ok: true; payload: ParsedWorkspacePayload }
    | { ok: false; error: string } => {
    const name = form.name.trim()
    if (!name) return { ok: false, error: "Name is required." }

    return {
      ok: true,
      payload: {
        name,
        color: form.color || DEFAULT_WORKSPACE_COLOR,
        description: form.description.trim() || null,
      },
    }
  }, [form])

  return { form, setForm, validate, reset, hydrate }
}

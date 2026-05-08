"use client"

import {
  DEFAULT_ENV_VALUE,
  ENV_LABEL_KEY,
  type LabelEntry,
  entriesToLabels,
  labelsToEntries,
} from "@/components/clusters/labels"
import type { ConnectionProfileResponse } from "@/lib/types/connection"
import { DEFAULT_WORKSPACE_ID } from "@/lib/types/workspace"
import React from "react"

export interface ConnectionFormState {
  name: string
  hosts: string
  port: string
  username: string
  password: string
  color: string
  note: string
  labels: LabelEntry[]
  workspaceId: string
}

export interface ParsedConnectionPayload {
  name: string
  hosts: string[]
  port: number
  username: string | null
  password: string | null
  color: string
  note: string | null
  labels: Record<string, string>
  workspaceId: string
}

const DEFAULT_COLOR = "#4F46E5"

const EMPTY_FORM: ConnectionFormState = {
  name: "",
  hosts: "",
  port: "3000",
  username: "",
  password: "",
  color: DEFAULT_COLOR,
  note: "",
  labels: [{ key: ENV_LABEL_KEY, value: DEFAULT_ENV_VALUE }],
  workspaceId: DEFAULT_WORKSPACE_ID,
}

export function fromConnection(
  conn: ConnectionProfileResponse,
): ConnectionFormState {
  return {
    name: conn.name,
    hosts: conn.hosts.join(", "),
    port: String(conn.port),
    username: conn.username ?? "",
    password: "",
    color: conn.color,
    note: conn.note ?? "",
    labels: labelsToEntries(conn.labels ?? {}),
    workspaceId: conn.workspaceId ?? DEFAULT_WORKSPACE_ID,
  }
}

/**
 * Shared state + validation for Add / Edit Connection dialogs.
 *
 * - ``form`` / ``setForm``: standard form state.
 * - ``validate``: parses + validates user input into the API payload shape;
 *   returns either ``{ ok: true, payload }`` or ``{ ok: false, error }``.
 * - ``reset``: restore defaults (used by Add dialog after a successful submit).
 * - ``hydrate``: replace the entire form (used by Edit dialog when a different
 *   connection is selected).
 */
export function useConnectionForm(initial?: ConnectionFormState) {
  const [form, setForm] = React.useState<ConnectionFormState>(
    initial ?? EMPTY_FORM,
  )

  const reset = React.useCallback(() => setForm(EMPTY_FORM), [])
  const hydrate = React.useCallback(
    (next: ConnectionFormState) => setForm(next),
    [],
  )

  const validate = React.useCallback(():
    | { ok: true; payload: ParsedConnectionPayload }
    | { ok: false; error: string } => {
    const name = form.name.trim()
    if (!name) return { ok: false, error: "Name is required." }

    const hosts = form.hosts
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
    if (hosts.length === 0) {
      return { ok: false, error: "At least one host is required." }
    }

    const port = Number.parseInt(form.port, 10)
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      return { ok: false, error: "Port must be a number between 1 and 65535." }
    }

    return {
      ok: true,
      payload: {
        name,
        hosts,
        port,
        username: form.username.trim() || null,
        password: form.password ? form.password : null,
        color: form.color || DEFAULT_COLOR,
        note: form.note.trim() || null,
        labels: entriesToLabels(form.labels),
        workspaceId: form.workspaceId || DEFAULT_WORKSPACE_ID,
      },
    }
  }, [form])

  return { form, setForm, validate, reset, hydrate }
}

/**
 * Set / record note CRUD.
 * Endpoint base: /api/notes
 */

import type { PkType } from "../types/record"
import type {
  RecordNote,
  SetNote,
  UpsertRecordNoteRequest,
  UpsertSetNoteRequest,
} from "../types/note"
import { apiDelete, apiGet, apiPut } from "./client"

interface SetNotesListResponse {
  notes: SetNote[]
}

interface RecordNotesListResponse {
  notes: RecordNote[]
}

const enc = encodeURIComponent

// ---------------------------------------------------------------------------
// Set notes
// ---------------------------------------------------------------------------

/**
 * PUT /api/notes/sets/{conn_id}/{ns}/{set} — upsert a set note. An empty
 * ``note`` deletes the existing row (idempotent — no error when none).
 */
export async function upsertSetNote(
  connId: string,
  namespace: string,
  setName: string,
  body: UpsertSetNoteRequest,
): Promise<SetNote | null> {
  const path = `/notes/sets/${enc(connId)}/${enc(namespace)}/${enc(setName)}`
  // The empty-note delete returns 204; non-empty returns the saved row.
  if (!body.note) {
    await apiPut<unknown>(path, body)
    return null
  }
  return apiPut<SetNote>(path, body)
}

/** DELETE /api/notes/sets/{conn_id}/{ns}/{set} — remove the set note. */
export function deleteSetNote(
  connId: string,
  namespace: string,
  setName: string,
): Promise<void> {
  return apiDelete(
    `/notes/sets/${enc(connId)}/${enc(namespace)}/${enc(setName)}`,
  )
}

/**
 * GET /api/notes/sets/{conn_id}?namespace=... — list set notes for the connection.
 */
export async function listSetNotes(
  connId: string,
  namespace?: string,
): Promise<SetNote[]> {
  const qs = namespace ? `?namespace=${enc(namespace)}` : ""
  const resp = await apiGet<SetNotesListResponse>(
    `/notes/sets/${enc(connId)}${qs}`,
  )
  return resp.notes
}

// ---------------------------------------------------------------------------
// Record notes
// ---------------------------------------------------------------------------

/**
 * PUT /api/notes/records/{conn_id}/{ns}/{set}/{pk} — upsert a record note.
 * Empty ``note`` deletes (idempotent).
 */
export async function upsertRecordNote(
  connId: string,
  namespace: string,
  setName: string,
  pk: string,
  body: UpsertRecordNoteRequest,
): Promise<RecordNote | null> {
  const path = `/notes/records/${enc(connId)}/${enc(namespace)}/${enc(setName)}/${enc(pk)}`
  if (!body.note) {
    await apiPut<unknown>(path, body)
    return null
  }
  return apiPut<RecordNote>(path, body)
}

/** DELETE /api/notes/records/{conn_id}/{ns}/{set}/{pk}?pk_type=... */
export function deleteRecordNote(
  connId: string,
  namespace: string,
  setName: string,
  pk: string,
  pkType: PkType = "auto",
): Promise<void> {
  const path = `/notes/records/${enc(connId)}/${enc(namespace)}/${enc(setName)}/${enc(pk)}?pk_type=${enc(pkType)}`
  return apiDelete(path)
}

/**
 * GET /api/notes/records/{conn_id}?ns=&set= — list every record note for a
 * (connection, namespace, set) slice. This is the recovery path when the
 * random-50 data browser scan does not surface a note.
 */
export async function listRecordNotes(
  connId: string,
  namespace: string,
  setName: string,
): Promise<RecordNote[]> {
  const path = `/notes/records/${enc(connId)}?ns=${enc(namespace)}&set=${enc(setName)}`
  const resp = await apiGet<RecordNotesListResponse>(path)
  return resp.notes
}

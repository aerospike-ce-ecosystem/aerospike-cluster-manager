/**
 * Set / record annotation types mirrored from backend Pydantic models.
 * See: backend/src/aerospike_cluster_manager_api/models/note.py
 */

import type { PkType } from "./record"

/** Particle type stored in the metaDB row (``auto`` is request-only). */
export type StoredPkType = "string" | "int" | "bytes"

export interface SetNote {
  connectionId: string
  namespace: string
  setName: string
  note: string
  createdAt: string
  updatedAt: string
  updatedBy?: string | null
}

export interface RecordNote {
  connectionId: string
  namespace: string
  setName: string
  pkText: string
  pkType: StoredPkType
  digestHex?: string | null
  note: string
  createdAt: string
  updatedAt: string
  updatedBy?: string | null
}

export interface UpsertSetNoteRequest {
  note: string
}

export interface UpsertRecordNoteRequest {
  note: string
  pkType?: PkType
}

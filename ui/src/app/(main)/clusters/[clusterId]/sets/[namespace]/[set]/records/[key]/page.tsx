"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { RecordDetailSkeleton } from "@/components/skeletons/RecordDetailSkeleton"
import { clusterSections } from "@/app/siteConfig"
import { ApiError } from "@/lib/api/client"
import { deleteRecord, getRecordDetail, putRecord } from "@/lib/api/records"
import type { AerospikeRecord, BinValue, PkType } from "@/lib/types/record"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type PageProps = {
  params: { clusterId: string; namespace: string; set: string; key: string }
}

// ---------------------------------------------------------------------------
// Aerospike stores GeoJSON as a JSON string in a dedicated particle type, but the Python
// backend currently returns it as a plain string. Detect the "type"/"coordinates" shape so
// the UI surfaces it as GeoJSON rather than an opaque string.
// ---------------------------------------------------------------------------
const GEOJSON_TYPES = new Set([
  "Point",
  "LineString",
  "Polygon",
  "MultiPoint",
  "MultiLineString",
  "MultiPolygon",
  "GeometryCollection",
  "Feature",
  "FeatureCollection",
])

type BinKind =
  | "string"
  | "integer"
  | "double"
  | "boolean"
  | "list"
  | "map"
  | "geojson"
  | "null"

function looksLikeGeoJsonString(s: string): boolean {
  const trimmed = s.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false
  if (!trimmed.includes('"type"')) return false
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return (
      typeof parsed.type === "string" &&
      GEOJSON_TYPES.has(parsed.type) &&
      ("coordinates" in parsed ||
        "geometries" in parsed ||
        "features" in parsed)
    )
  } catch {
    return false
  }
}

function detectBinType(value: unknown): BinKind {
  if (value === null || value === undefined) return "null"
  if (Array.isArray(value)) return "list"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "double"
  if (typeof value === "string") {
    return looksLikeGeoJsonString(value) ? "geojson" : "string"
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    if (typeof v.type === "string" && GEOJSON_TYPES.has(v.type as string))
      return "geojson"
    return "map"
  }
  return "string"
}

function formatBinValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") {
    if (looksLikeGeoJsonString(value)) {
      try {
        return JSON.stringify(JSON.parse(value), null, 2)
      } catch {
        return value
      }
    }
    return value
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

// Convert a bin value into the text we show inside the editor textarea.
// Strings go in raw so the user doesn't have to deal with quoting; structured
// types are pretty-printed JSON; geojson stays as a JSON object string.
function binToDraft(value: unknown, kind: BinKind): string {
  if (kind === "string") return (value as string) ?? ""
  if (kind === "null") return "null"
  if (kind === "geojson") {
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2)
      } catch {
        return value
      }
    }
    return JSON.stringify(value, null, 2)
  }
  return formatBinValue(value)
}

// Parse editor text back into a JS value honoring the chosen bin kind.
// Throws on invalid input with a message the UI surfaces next to the field.
function draftToBin(draft: string, kind: BinKind): BinValue {
  switch (kind) {
    case "null":
      return null
    case "string":
      return draft
    case "integer": {
      const n = Number(draft.trim())
      if (!Number.isFinite(n) || !Number.isInteger(n))
        throw new Error("Not a valid integer")
      return n
    }
    case "double": {
      const n = Number(draft.trim())
      if (!Number.isFinite(n)) throw new Error("Not a valid number")
      return n
    }
    case "boolean": {
      const t = draft.trim().toLowerCase()
      if (t === "true") return true
      if (t === "false") return false
      throw new Error("Must be 'true' or 'false'")
    }
    case "list":
    case "map": {
      try {
        return JSON.parse(draft) as BinValue
      } catch (e) {
        throw new Error(
          `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
    case "geojson": {
      try {
        const parsed = JSON.parse(draft) as Record<string, unknown>
        if (
          typeof parsed.type !== "string" ||
          !GEOJSON_TYPES.has(parsed.type as string)
        )
          throw new Error("GeoJSON 'type' missing or unknown")
        // Round-trip back to string form — that's what the backend expects.
        return JSON.stringify(parsed)
      } catch (e) {
        throw new Error(
          `Invalid GeoJSON: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }
}

const TTL_NEVER_SENTINEL = 4_294_967_295

function formatTtl(ttl: number | undefined): string {
  if (ttl === undefined) return "—"
  if (ttl === -1 || ttl === 0 || ttl === TTL_NEVER_SENTINEL) return "never"
  if (ttl >= 86400)
    return `${Math.floor(ttl / 86400)}d ${Math.floor((ttl % 86400) / 3600)}h`
  if (ttl >= 3600)
    return `${Math.floor(ttl / 3600)}h ${Math.floor((ttl % 3600) / 60)}m`
  if (ttl >= 60) return `${Math.floor(ttl / 60)}m ${ttl % 60}s`
  return `${ttl}s`
}

const CITRUSLEAF_EPOCH_MS = 1_262_304_000_000

function formatLastUpdate(lastUpdateMs: number | undefined | null): string {
  if (!lastUpdateMs) return "—"
  const msSinceEpoch =
    lastUpdateMs < 1_000_000_000_000
      ? Math.floor(lastUpdateMs / 1_000_000) + CITRUSLEAF_EPOCH_MS
      : lastUpdateMs
  return new Date(msSinceEpoch).toLocaleString()
}

// ---------------------------------------------------------------------------
// Draft model for the editor
// ---------------------------------------------------------------------------
interface BinDraft {
  id: string
  name: string
  kind: BinKind
  value: string
}

const BIN_KINDS: BinKind[] = [
  "string",
  "integer",
  "double",
  "boolean",
  "list",
  "map",
  "geojson",
  "null",
]

function buildInitialDraft(record: AerospikeRecord): BinDraft[] {
  return Object.entries(record.bins).map(([name, value], i) => {
    const kind = detectBinType(value)
    return {
      id: `bin-${i}-${name}`,
      name,
      kind,
      value: binToDraft(value, kind),
    }
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function RecordDetailPage({ params }: PageProps) {
  const router = useRouter()
  const pk = decodeURIComponent(params.key)

  const [record, setRecord] = useState<AerospikeRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [drafts, setDrafts] = useState<BinDraft[]>([])
  const [binErrors, setBinErrors] = useState<Record<string, string>>({})
  const [ttlDraft, setTtlDraft] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const loadRecord = (signal?: { cancelled: boolean }) => {
    setIsLoading(true)
    setError(null)
    return getRecordDetail(params.clusterId, {
      ns: params.namespace,
      set: params.set,
      pk,
      pk_type: "auto" as PkType,
    })
      .then((r) => {
        if (signal?.cancelled) return
        setRecord(r)
      })
      .catch((err) => {
        if (signal?.cancelled) return
        if (err instanceof ApiError) setError(err.detail || err.message)
        else if (err instanceof Error) setError(err.message)
        else setError("Failed to load record")
      })
      .finally(() => {
        if (!signal?.cancelled) setIsLoading(false)
      })
  }

  useEffect(() => {
    const signal = { cancelled: false }
    loadRecord(signal)
    return () => {
      signal.cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.clusterId, params.namespace, params.set, pk])

  const handleDelete = async () => {
    if (!record) return
    if (!window.confirm(`Delete record '${pk}'?`)) return
    setDeleting(true)
    try {
      await deleteRecord(params.clusterId, {
        ns: params.namespace,
        set: params.set,
        pk,
        pk_type: "auto" as PkType,
      })
      router.push(
        clusterSections.set(params.clusterId, params.namespace, params.set),
      )
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to delete record")
      setDeleting(false)
    }
  }

  const startEdit = () => {
    if (!record) return
    setDrafts(buildInitialDraft(record))
    const ttl = record.meta.ttl
    // When the record is set to "never expire", start with 0 (= keep TTL) so we don't force a new TTL on save.
    setTtlDraft(
      ttl === undefined || ttl === -1 || ttl === TTL_NEVER_SENTINEL
        ? "-1"
        : String(ttl),
    )
    setBinErrors({})
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setDrafts([])
    setBinErrors({})
  }

  const updateDraft = (id: string, patch: Partial<BinDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
    // Clear the per-bin error as the user edits
    if (patch.value !== undefined || patch.kind !== undefined) {
      setBinErrors((prev) => {
        const { [id]: _, ...rest } = prev
        return rest
      })
    }
  }

  const addBin = () => {
    const id = `bin-new-${Date.now()}`
    setDrafts((prev) => [...prev, { id, name: "", kind: "string", value: "" }])
  }

  const removeBin = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    setBinErrors((prev) => {
      const { [id]: _, ...rest } = prev
      return rest
    })
  }

  const handleSave = async () => {
    if (!record) return
    setError(null)

    // Validate bin names
    const nextErrors: Record<string, string> = {}
    const seenNames = new Set<string>()
    for (const d of drafts) {
      const n = d.name.trim()
      if (!n) {
        nextErrors[d.id] = "Bin name is required"
        continue
      }
      if (seenNames.has(n)) {
        nextErrors[d.id] = `Duplicate bin name '${n}'`
        continue
      }
      seenNames.add(n)
    }

    // Parse each draft value in its chosen kind
    const bins: Record<string, BinValue> = {}
    for (const d of drafts) {
      if (nextErrors[d.id]) continue
      try {
        bins[d.name.trim()] = draftToBin(d.value, d.kind)
      } catch (e) {
        nextErrors[d.id] = e instanceof Error ? e.message : String(e)
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setBinErrors(nextErrors)
      return
    }

    let ttl: number | undefined
    const t = ttlDraft.trim()
    if (t !== "") {
      const n = Number(t)
      if (!Number.isInteger(n)) {
        setError(
          "TTL must be an integer (0 keep existing, -1 never expire, or seconds until expiry).",
        )
        return
      }
      ttl = n
    }

    setSaving(true)
    try {
      await putRecord(params.clusterId, {
        key: { namespace: params.namespace, set: params.set, pk },
        bins,
        ttl,
        pkType: "auto" as PkType,
      })
      setIsEditing(false)
      setDrafts([])
      await loadRecord()
    } catch (err) {
      if (err instanceof ApiError) setError(err.detail || err.message)
      else if (err instanceof Error) setError(err.message)
      else setError("Failed to save record")
    } finally {
      setSaving(false)
    }
  }

  const bins = record ? Object.entries(record.bins) : []
  const meta = record?.meta
  const binCount = isEditing ? drafts.length : bins.length
  const hasValidationErrors = useMemo(
    () => Object.keys(binErrors).length > 0,
    [binErrors],
  )

  return (
    <main className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500"
      >
        <Link
          href={clusterSections.sets(params.clusterId)}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          Sets
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={clusterSections.set(
            params.clusterId,
            params.namespace,
            params.set,
          )}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          <span className="font-mono">
            {params.namespace}.{params.set}
          </span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">{pk}</span>
      </nav>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Record
          </span>
          <h1 className="mt-1 break-all font-mono text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            {pk}
          </h1>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                variant="secondary"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                isLoading={saving}
                loadingText="Saving…"
                disabled={saving || hasValidationErrors}
              >
                Save changes
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={startEdit}
                disabled={!record || deleting}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                isLoading={deleting}
                loadingText="Deleting…"
                disabled={!record || deleting}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoading && !record ? (
        <RecordDetailSkeleton />
      ) : !record ? (
        <Card className="py-10 text-center text-sm text-gray-500 dark:text-gray-500">
          Record not found.
        </Card>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-500">
                Generation
              </dt>
              <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
                {meta?.generation ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-500">TTL</dt>
              <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
                {isEditing ? (
                  <Input
                    value={ttlDraft}
                    onChange={(e) => setTtlDraft(e.target.value)}
                    placeholder="-1 never, 0 keep, >0 seconds"
                    className="h-7 w-40 text-xs"
                  />
                ) : (
                  formatTtl(meta?.ttl)
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-500">
                Last update
              </dt>
              <dd
                className="font-mono text-sm font-medium text-gray-900 dark:text-gray-50"
                title={
                  meta && !meta.lastUpdateMs
                    ? "aerospike-py RecordMetadata exposes only (gen, ttl); last_update_time is not surfaced."
                    : undefined
                }
              >
                {formatLastUpdate(meta?.lastUpdateMs)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-500">Bins</dt>
              <dd className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-gray-50">
                {binCount}
              </dd>
            </div>
          </Card>

          <Card className="p-0">
            <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
              {isEditing ? (
                drafts.length === 0 ? (
                  <li className="px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-500">
                    No bins yet — use <strong>Add bin</strong> below.
                  </li>
                ) : (
                  drafts.map((d) => (
                    <li key={d.id} className="flex flex-col gap-2 px-5 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <div className="flex min-w-40 flex-col gap-1.5 sm:w-56">
                          <Label htmlFor={`${d.id}-name`}>Bin name</Label>
                          <Input
                            id={`${d.id}-name`}
                            value={d.name}
                            onChange={(e) =>
                              updateDraft(d.id, { name: e.target.value })
                            }
                            placeholder="bin_name"
                          />
                          <Label htmlFor={`${d.id}-type`}>Type</Label>
                          <select
                            id={`${d.id}-type`}
                            value={d.kind}
                            onChange={(e) =>
                              updateDraft(d.id, {
                                kind: e.target.value as BinKind,
                              })
                            }
                            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                          >
                            {BIN_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-xs text-red-600 hover:text-red-700"
                            onClick={() => removeBin(d.id)}
                          >
                            Remove bin
                          </Button>
                        </div>
                        <div className="flex-1">
                          {d.kind === "boolean" ? (
                            <select
                              value={d.value || "false"}
                              onChange={(e) =>
                                updateDraft(d.id, { value: e.target.value })
                              }
                              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 font-mono text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : d.kind === "null" ? (
                            <div className="rounded bg-gray-50 p-3 font-mono text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                              null
                            </div>
                          ) : d.kind === "string" ||
                            d.kind === "integer" ||
                            d.kind === "double" ? (
                            <Input
                              value={d.value}
                              onChange={(e) =>
                                updateDraft(d.id, { value: e.target.value })
                              }
                              className="font-mono"
                              placeholder={
                                d.kind === "string"
                                  ? "hello"
                                  : d.kind === "integer"
                                    ? "42"
                                    : "3.14"
                              }
                            />
                          ) : (
                            <textarea
                              value={d.value}
                              onChange={(e) =>
                                updateDraft(d.id, { value: e.target.value })
                              }
                              rows={d.kind === "geojson" ? 6 : 8}
                              className="w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"
                              placeholder={
                                d.kind === "list"
                                  ? '[1, "two", 3.0]'
                                  : d.kind === "map"
                                    ? '{"key": "value"}'
                                    : '{"type":"Point","coordinates":[0,0]}'
                              }
                            />
                          )}
                          {binErrors[d.id] && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                              {binErrors[d.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))
                )
              ) : bins.length === 0 ? (
                <li className="px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-500">
                  This record has no bins.
                </li>
              ) : (
                bins.map(([name, value]) => (
                  <li
                    key={name}
                    className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start"
                  >
                    <div className="min-w-40 sm:w-56">
                      <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {name}
                      </p>
                      <Badge variant="neutral">{detectBinType(value)}</Badge>
                    </div>
                    <pre className="flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                      {formatBinValue(value)}
                    </pre>
                  </li>
                ))
              )}
            </ul>
            {isEditing && (
              <div className="border-t border-gray-200 px-5 py-3 dark:border-gray-800">
                <Button type="button" variant="secondary" onClick={addBin}>
                  + Add bin
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </main>
  )
}

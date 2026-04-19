"use client"

import {
  RiArrowLeftLine,
  RiDeleteBin2Line,
  RiPencilLine,
  RiSaveLine,
} from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

import { clusterSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import {
  RecordEditorFields,
  type BinEntry,
} from "@/components/browser/RecordEditorDialog"
import { RecordDetailSections } from "@/components/browser/RecordViewDialog"
import {
  buildBinEntriesFromRecord,
  createEmptyBinEntry,
  getErrorMessage,
  parseBinValue,
} from "@/components/browser/_utils"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import {
  deleteRecord,
  getRecordDetail,
  putRecord,
} from "@/lib/api/records"
import type {
  AerospikeRecord,
  BinValue,
  RecordWriteRequest,
} from "@/lib/types/record"
import { useToastStore } from "@/stores/toast-store"

type PageProps = {
  params: {
    clusterId: string
    namespace: string
    set: string
    key: string
  }
  searchParams: { intent?: string }
}

type PageMode = "view" | "edit"

export default function RecordDetailPage({ params, searchParams }: PageProps) {
  const { clusterId, namespace, set, key } = params
  const { intent } = searchParams
  const decodedNs = decodeURIComponent(namespace)
  const decodedSet = decodeURIComponent(set)
  const pk = decodeURIComponent(key)

  const router = useRouter()
  const initialMode: PageMode = intent === "edit" ? "edit" : "view"

  const [record, setRecord] = useState<AerospikeRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<PageMode>(initialMode)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const [editorPK, setEditorPK] = useState(pk)
  const [editorTTL, setEditorTTL] = useState("0")
  const [editorBins, setEditorBins] = useState<BinEntry[]>([
    createEmptyBinEntry(),
  ])
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>(
    {},
  )

  const resetEditorFromRecord = useCallback(
    (nextRecord: AerospikeRecord) => {
      const nextBins = buildBinEntriesFromRecord(nextRecord)
      setRecord(nextRecord)
      setEditorPK(nextRecord.key.pk ?? pk)
      setEditorTTL(String(nextRecord.meta.ttl))
      setEditorBins(nextBins.length > 0 ? nextBins : [createEmptyBinEntry()])
      setUseCodeEditor({})
    },
    [pk],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getRecordDetail(clusterId, {
      ns: decodedNs,
      set: decodedSet,
      pk,
    })
      .then((next) => {
        if (cancelled) return
        resetEditorFromRecord(next)
      })
      .catch((err) => {
        if (cancelled) return
        setError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clusterId, decodedNs, decodedSet, pk, resetEditorFromRecord])

  const addBin = useCallback(() => {
    setEditorBins((prev) => [...prev, createEmptyBinEntry()])
  }, [])

  const removeBin = useCallback((id: string) => {
    setEditorBins((prev) => prev.filter((bin) => bin.id !== id))
  }, [])

  const updateBin = useCallback(
    (id: string, field: keyof BinEntry, value: string) => {
      setEditorBins((prev) =>
        prev.map((bin) => (bin.id === id ? { ...bin, [field]: value } : bin)),
      )
    },
    [],
  )

  const backHref = clusterSections.set(clusterId, decodedNs, decodedSet)

  const handleSave = useCallback(async () => {
    if (!editorPK.trim()) {
      useToastStore.getState().addToast("error", "Primary key is required")
      return
    }
    setSaving(true)
    try {
      const binMap: Record<string, BinValue> = {}
      for (const bin of editorBins) {
        if (bin.name.trim()) {
          binMap[bin.name.trim()] = parseBinValue(bin.value, bin.type)
        }
      }
      const payload: RecordWriteRequest = {
        key: { namespace: decodedNs, set: decodedSet, pk: editorPK.trim() },
        bins: binMap,
        ttl: Number.parseInt(editorTTL, 10) || 0,
      }
      const updated = await putRecord(clusterId, payload)
      useToastStore.getState().addToast("success", "Record updated")
      resetEditorFromRecord(updated)
      setMode("view")
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [
    clusterId,
    decodedNs,
    decodedSet,
    editorBins,
    editorPK,
    editorTTL,
    resetEditorFromRecord,
  ])

  const handleDelete = useCallback(async () => {
    if (!record) return
    setDeleting(true)
    try {
      await deleteRecord(clusterId, {
        ns: decodedNs,
        set: decodedSet,
        pk: record.key.pk ?? pk,
      })
      useToastStore.getState().addToast("success", "Record deleted")
      router.push(backHref)
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }, [backHref, clusterId, decodedNs, decodedSet, pk, record, router])

  const description = useMemo(
    () => (
      <span className="font-mono text-xs">
        {decodedNs}
        <span className="mx-1 text-gray-400 dark:text-gray-600">.</span>
        {decodedSet}
        <span className="mx-1 text-gray-400 dark:text-gray-600">/</span>
        <span className="text-indigo-600 dark:text-indigo-400">{pk}</span>
      </span>
    ),
    [decodedNs, decodedSet, pk],
  )

  return (
    <main className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
      >
        <Link
          href={clusterSections.sets(clusterId)}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          Sets
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={backHref}
          className="hover:text-gray-900 dark:hover:text-gray-50"
        >
          <span className="font-mono">
            {decodedNs}.{decodedSet}
          </span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-gray-900 dark:text-gray-50">{pk}</span>
      </nav>

      <PageHeader
        title={pk}
        description={description}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={backHref} className="gap-1.5">
                <RiArrowLeftLine aria-hidden className="size-4" />
                Back
              </Link>
            </Button>
            {mode === "view" ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={loading || !record}
                  className="gap-1.5"
                >
                  <RiDeleteBin2Line aria-hidden className="size-4" />
                  Delete
                </Button>
                <Button
                  onClick={() => setMode("edit")}
                  disabled={loading || !record}
                  className="gap-1.5"
                >
                  <RiPencilLine aria-hidden className="size-4" />
                  Edit
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (record) resetEditorFromRecord(record)
                    setMode("view")
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  isLoading={saving}
                  className="gap-1.5"
                >
                  <RiSaveLine aria-hidden className="size-4" />
                  Save
                </Button>
              </>
            )}
          </>
        }
      />

      {error && <InlineAlert message={error} variant="error" />}

      {loading && !record && !error ? (
        <div className="rounded-md border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Loading record…
        </div>
      ) : record ? (
        <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#090E1A]">
          {mode === "view" ? (
            <RecordDetailSections record={record} />
          ) : (
            <RecordEditorFields
              mode="edit"
              pk={editorPK}
              onPKChange={setEditorPK}
              ttl={editorTTL}
              onTTLChange={setEditorTTL}
              bins={editorBins}
              onAddBin={addBin}
              onRemoveBin={removeBin}
              onUpdateBin={updateBin}
              useCodeEditor={useCodeEditor}
              onToggleCodeEditor={(id) =>
                setUseCodeEditor((prev) => ({ ...prev, [id]: !prev[id] }))
              }
              saving={saving}
              record={record}
              namespace={decodedNs}
              setName={decodedSet}
            />
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(next) => !deleting && setDeleteConfirmOpen(next)}
        title="Delete Record"
        description={`Delete record with PK "${pk}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </main>
  )
}

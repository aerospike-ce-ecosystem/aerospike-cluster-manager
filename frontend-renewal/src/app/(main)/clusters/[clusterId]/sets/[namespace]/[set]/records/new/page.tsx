"use client"

import { RiArrowLeftLine, RiSaveLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

import { clusterSections } from "@/app/siteConfig"
import { Button } from "@/components/Button"
import {
  RecordEditorFields,
  type BinEntry,
} from "@/components/browser/RecordEditorDialog"
import {
  createEmptyBinEntry,
  getErrorMessage,
  parseBinValue,
} from "@/components/browser/_utils"
import { PageHeader } from "@/components/common/PageHeader"
import { putRecord } from "@/lib/api/records"
import type { BinValue, RecordWriteRequest } from "@/lib/types/record"
import { useToastStore } from "@/stores/toast-store"

type PageProps = {
  params: {
    clusterId: string
    namespace: string
    set: string
  }
}

export default function NewRecordPage({ params }: PageProps) {
  const { clusterId, namespace, set } = params
  const decodedNs = decodeURIComponent(namespace)
  const decodedSet = decodeURIComponent(set)

  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [editorPK, setEditorPK] = useState("")
  const [editorTTL, setEditorTTL] = useState("0")
  const [editorBins, setEditorBins] = useState<BinEntry[]>([
    createEmptyBinEntry(),
  ])
  const [useCodeEditor, setUseCodeEditor] = useState<Record<string, boolean>>(
    {},
  )

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
      await putRecord(clusterId, payload)
      useToastStore.getState().addToast("success", "Record created")
      router.push(backHref)
    } catch (err) {
      useToastStore.getState().addToast("error", getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [
    backHref,
    clusterId,
    decodedNs,
    decodedSet,
    editorBins,
    editorPK,
    editorTTL,
    router,
  ])

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
        <span className="font-mono text-gray-900 dark:text-gray-50">
          New record
        </span>
      </nav>

      <PageHeader
        title="New record"
        description={
          <span className="font-mono text-xs">
            {decodedNs}
            <span className="mx-1 text-gray-400 dark:text-gray-600">.</span>
            {decodedSet}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href={backHref} className="gap-1.5">
                <RiArrowLeftLine aria-hidden className="size-4" />
                Back
              </Link>
            </Button>
            <Button onClick={handleSave} isLoading={saving} className="gap-1.5">
              <RiSaveLine aria-hidden className="size-4" />
              Create
            </Button>
          </>
        }
      />

      <div className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#090E1A]">
        <RecordEditorFields
          mode="create"
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
          namespace={decodedNs}
          setName={decodedSet}
        />
      </div>
    </main>
  )
}

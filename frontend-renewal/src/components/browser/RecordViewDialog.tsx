"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import type { AerospikeRecord } from "@/lib/types/record"

import { detectBinType } from "./_utils"
import { BinRow } from "./BinRow"
import { RecordMetadataGrid } from "./RecordMetadataGrid"

interface RecordViewDialogProps {
  record: AerospikeRecord | null
  onClose: () => void
}

export function RecordDetailSections({ record }: { record: AerospikeRecord }) {
  const binEntries = Object.entries(record.bins)

  return (
    <div className="space-y-5 p-5">
      <RecordMetadataGrid record={record} mode="view" />

      <section>
        <h4 className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
          Bins
          <span className="text-gray-400 dark:text-gray-600">
            ({binEntries.length})
          </span>
          <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
        </h4>
        <div className="divide-y divide-gray-200 overflow-hidden rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          <div className="grid grid-cols-[2rem_1fr_5rem_2fr_2rem] items-center gap-2 bg-gray-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            <span className="text-right">#</span>
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span />
          </div>
          {binEntries.map(([name, value], i) => (
            <BinRow
              key={name}
              mode="view"
              index={i + 1}
              name={name}
              type={detectBinType(value)}
              value={value}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

export function RecordDetailContent({ record }: { record: AerospikeRecord }) {
  return (
    <div className="max-h-[calc(80vh-60px)] overflow-auto">
      <RecordDetailSections record={record} />
    </div>
  )
}

export function RecordViewDialog({ record, onClose }: RecordViewDialogProps) {
  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="space-y-0 border-b border-gray-200 px-5 pb-3 pt-5 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-medium">
              Record Detail
            </DialogTitle>
            <span className="ml-4 max-w-[250px] truncate font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
              {record?.key.pk}
            </span>
          </div>
          <DialogDescription className="sr-only">
            Record details for {record?.key.pk}
          </DialogDescription>
        </DialogHeader>
        {record && <RecordDetailContent record={record} />}
      </DialogContent>
    </Dialog>
  )
}

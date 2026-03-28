"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RecordMetadataGrid } from "@/components/browser/record-metadata-grid";
import { BinRow } from "@/components/browser/bin-row";
import { detectBinType } from "@/lib/bin-utils";
import type { AerospikeRecord } from "@/lib/api/types";

interface RecordViewDialogProps {
  record: AerospikeRecord | null;
  onClose: () => void;
}

export function RecordDetailSections({ record }: { record: AerospikeRecord }) {
  const binEntries = Object.entries(record.bins);

  return (
    <div className="space-y-5 p-5">
      <RecordMetadataGrid record={record} mode="view" />

      <section>
        <h4 className="text-muted-foreground/60 mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase">
          Bins
          <span className="text-muted-foreground/30">({binEntries.length})</span>
          <span className="bg-border/30 h-px flex-1" />
        </h4>
        <div className="divide-base-300/30 divide-y overflow-hidden rounded-lg border">
          {/* Header row */}
          <div
            className="bin-row-grid bg-base-200/30 text-muted-foreground/50 font-mono text-[11px] tracking-wider uppercase"
            data-header
          >
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
  );
}

export function RecordDetailContent({ record }: { record: AerospikeRecord }) {
  return (
    <div className="max-h-[calc(80vh-60px)] overflow-auto">
      <RecordDetailSections record={record} />
    </div>
  );
}

export function RecordViewDialog({ record, onClose }: RecordViewDialogProps) {
  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-base-300/50 max-h-[80vh] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="border-base-300/40 space-y-0 border-b px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-medium">Record Detail</DialogTitle>
            <span className="text-primary ml-4 max-w-[250px] truncate font-mono text-[11px]">
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
  );
}

export function RecordViewSheet({ record, onClose }: RecordViewDialogProps) {
  return (
    <Sheet open={!!record} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="max-h-[85vh] gap-0 overflow-hidden p-0"
        data-testid="record-view-sheet"
      >
        <SheetHeader className="border-base-300/40 space-y-0 border-b px-5 pt-1 pb-3">
          <div className="flex items-center justify-between pr-10">
            <SheetTitle className="font-mono text-sm font-medium">Record Detail</SheetTitle>
            <span className="text-primary ml-4 max-w-[180px] truncate font-mono text-[11px]">
              {record?.key.pk}
            </span>
          </div>
          <SheetDescription className="sr-only">
            Record details for {record?.key.pk}
          </SheetDescription>
        </SheetHeader>
        {record && <RecordDetailContent record={record} />}
      </SheetContent>
    </Sheet>
  );
}

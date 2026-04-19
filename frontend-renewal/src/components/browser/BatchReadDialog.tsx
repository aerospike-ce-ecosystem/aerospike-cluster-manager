"use client"

import { RiFileCopyLine } from "@remixicon/react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { useToastStore } from "@/stores/toast-store"

interface BatchReadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  generateCode: () => string
}

/**
 * Renders a Python `aerospike_py.AsyncClient.batch_read(...)` snippet for the
 * records currently selected in the browser. Caller supplies the code via
 * `generateCode`, which lets the page inject the live host/port/key list.
 */
export function BatchReadDialog({
  open,
  onOpenChange,
  selectedCount,
  generateCode,
}: BatchReadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="space-y-0 border-b border-gray-200 px-5 pb-3 pt-5 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-medium">
              batch_read Code
            </DialogTitle>
            <span className="ml-4 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
              {selectedCount} keys
            </span>
          </div>
          <DialogDescription className="font-mono text-xs text-gray-500 dark:text-gray-400">
            Python aerospike-py async client batch_read snippet
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(80vh-100px)] overflow-auto">
          <div className="p-5">
            <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-end border-b border-gray-200 px-3 py-1.5 dark:border-gray-800">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateCode())
                    useToastStore
                      .getState()
                      .addToast("success", "Copied to clipboard")
                  }}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
                >
                  <RiFileCopyLine aria-hidden className="size-3" />
                  Copy
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
                <code>{generateCode()}</code>
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

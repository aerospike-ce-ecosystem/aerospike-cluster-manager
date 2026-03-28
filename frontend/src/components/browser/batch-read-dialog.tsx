"use client";

import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useToastStore } from "@/stores/toast-store";

interface BatchReadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  generateCode: () => string;
}

export function BatchReadDialog({
  open,
  onOpenChange,
  selectedCount,
  generateCode,
}: BatchReadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-base-300/50 max-h-[80vh] gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="border-base-300/40 space-y-0 border-b px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-sm font-medium">batch_read Code</DialogTitle>
            <span className="text-primary ml-4 font-mono text-[11px]">{selectedCount} keys</span>
          </div>
          <DialogDescription className="text-muted-foreground/60 font-mono text-xs">
            Python aerospike-py async client batch_read snippet
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(80vh-100px)] overflow-auto">
          <div className="p-5">
            <div className="border-base-300/40 bg-base-100/50 relative overflow-hidden rounded-md border">
              <div className="border-base-300/30 flex items-center justify-end border-b px-3 py-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generateCode());
                    useToastStore.getState().addToast("success", "Copied to clipboard");
                  }}
                  className="text-muted-foreground hover:text-base-content inline-flex items-center gap-1.5 font-mono text-[11px] transition-colors"
                >
                  <Copy className="h-3 w-3" />
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
  );
}

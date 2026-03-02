"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/utils";
import { Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface K8sPodLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  clusterName: string;
  podName: string;
}

export function K8sPodLogsDialog({
  open,
  onOpenChange,
  namespace,
  clusterName,
  podName,
}: K8sPodLogsDialogProps) {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [tailLines, setTailLines] = useState("500");
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const result = await api.getK8sPodLogs(
        namespace,
        clusterName,
        podName,
        parseInt(tailLines, 10),
      );
      setLogs(result.logs || "No logs available");
    } catch (err) {
      setLogs(`Error fetching logs: ${getErrorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && podName) {
      fetchLogs();
    }
  }, [open, podName]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      toast.success("Logs copied to clipboard");
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${podName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{podName} — Logs</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 py-2">
          <Select value={tailLines} onValueChange={setTailLines}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 lines</SelectItem>
              <SelectItem value="500">500 lines</SelectItem>
              <SelectItem value="1000">1000 lines</SelectItem>
              <SelectItem value="5000">5000 lines</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`mr-2 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="mr-2 h-3 w-3" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-3 w-3" />
            Download
          </Button>
        </div>
        <pre
          ref={logRef}
          className="bg-muted flex-1 overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-[300px] max-h-[60vh]"
        >
          {loading ? "Loading logs..." : logs}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

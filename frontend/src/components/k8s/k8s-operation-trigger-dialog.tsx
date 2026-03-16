"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog } from "@/components/common/form-dialog";
import { K8sPodTable } from "@/components/k8s/k8s-pod-table";
import { getErrorMessage } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { CheckCircle, AlertTriangle } from "lucide-react";
import type { K8sPodStatus, OperationRequest } from "@/lib/api/types";

type OperationKind = "WarmRestart" | "PodRestart";

interface K8sOperationTriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  clusterName: string;
  pods: K8sPodStatus[];
  onSuccess?: () => void;
}

export function K8sOperationTriggerDialog({
  open,
  onOpenChange,
  namespace,
  clusterName,
  pods,
  onSuccess,
}: K8sOperationTriggerDialogProps) {
  const [kind, setKind] = useState<OperationKind>("WarmRestart");
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [operationId, setOperationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"configure" | "confirm" | "result">("configure");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind("WarmRestart");
      setSelectedPods([]);
      setOperationId("");
      setError(null);
      setStep("configure");
      setResultMessage(null);
    }
  }, [open]);

  const handleNext = () => {
    if (step === "configure") {
      setStep("confirm");
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (step === "configure") {
      handleNext();
      return;
    }

    if (step === "confirm") {
      setLoading(true);
      setError(null);
      try {
        const request: OperationRequest = {
          kind,
          ...(operationId.trim() ? { id: operationId.trim() } : {}),
          ...(kind === "PodRestart" && selectedPods.length > 0 ? { podList: selectedPods } : {}),
        };

        await api.triggerK8sClusterOperation(namespace, clusterName, request);
        setResultMessage(
          `${kind === "WarmRestart" ? "Warm restart" : "Pod restart"} operation triggered successfully.`,
        );
        setStep("result");
        onSuccess?.();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }

    if (step === "result") {
      onOpenChange(false);
    }
  };

  const submitLabel =
    step === "configure" ? "Review" : step === "confirm" ? "Trigger Operation" : "Close";
  const dialogTitle = step === "result" ? "Operation Triggered" : "Trigger Cluster Operation";

  const isDisabled = step === "configure" && kind === "PodRestart" && selectedPods.length === 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      description={
        step === "configure"
          ? `Select an operation to perform on "${clusterName}".`
          : step === "confirm"
            ? "Review and confirm the operation details below."
            : undefined
      }
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      submitLabel={submitLabel}
      disabled={isDisabled}
      size="lg"
    >
      {step === "configure" && (
        <div className="space-y-4">
          {/* Operation type selector */}
          <div className="grid gap-2">
            <Label htmlFor="op-kind">Operation Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OperationKind)}>
              <SelectTrigger id="op-kind">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WarmRestart">Warm Restart (rolling, no data loss)</SelectItem>
                <SelectItem value="PodRestart">Pod Restart (select specific pods)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Operation ID (optional) */}
          <div className="grid gap-2">
            <Label htmlFor="op-id">Operation ID (optional)</Label>
            <Input
              id="op-id"
              placeholder="Auto-generated if empty"
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Pod selection for PodRestart */}
          {kind === "PodRestart" && (
            <div className="space-y-2">
              <Label>Select Pods to Restart</Label>
              <p className="text-base-content/60 text-xs">
                Choose one or more pods. If none are selected, all pods will be restarted.
              </p>
              <div className="max-h-[300px] overflow-y-auto rounded border p-2">
                <K8sPodTable
                  pods={pods}
                  selectable
                  selectedPods={selectedPods}
                  onSelectionChange={setSelectedPods}
                />
              </div>
              {selectedPods.length > 0 && (
                <p className="text-xs text-amber-600">
                  {selectedPods.length} pod{selectedPods.length !== 1 ? "s" : ""} selected for
                  restart
                </p>
              )}
            </div>
          )}

          {kind === "WarmRestart" && (
            <div className="bg-info/5 border-info/20 rounded border p-3">
              <p className="text-info text-xs">
                Warm restart performs a rolling restart of all pods in the cluster. Each pod is
                restarted one at a time, waiting for the previous pod to become ready before
                proceeding. This operation does not cause data loss.
              </p>
            </div>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-700">Confirm Operation</p>
                <p className="text-base-content/60 text-xs">
                  This will trigger a{" "}
                  <strong>{kind === "WarmRestart" ? "warm restart" : "pod restart"}</strong> on
                  cluster <strong>{clusterName}</strong> in namespace <strong>{namespace}</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-base-content/60">Operation:</span>
              <Badge variant="outline">
                {kind === "WarmRestart" ? "Warm Restart" : "Pod Restart"}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-base-content/60">Cluster:</span>
              <span className="font-mono text-xs">{clusterName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-base-content/60">Namespace:</span>
              <span className="font-mono text-xs">{namespace}</span>
            </div>
            {operationId.trim() && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-base-content/60">Operation ID:</span>
                <span className="font-mono text-xs">{operationId.trim()}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-base-content/60">Target Pods:</span>
              <span className="text-xs">
                {kind === "PodRestart" && selectedPods.length > 0
                  ? `${selectedPods.length} selected`
                  : "All pods"}
              </span>
            </div>
          </div>

          {kind === "PodRestart" && selectedPods.length > 0 && (
            <div>
              <p className="text-base-content/60 mb-1 text-xs">Selected pods:</p>
              <div className="flex flex-wrap gap-1">
                {selectedPods.map((pod) => (
                  <Badge key={pod} variant="outline" className="font-mono text-[11px]">
                    {pod}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "result" && resultMessage && (
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle className="h-10 w-10 text-green-500" />
          <p className="text-center text-sm">{resultMessage}</p>
          <p className="text-base-content/60 text-center text-xs">
            The operation status will be reflected in the cluster detail view.
          </p>
        </div>
      )}
    </FormDialog>
  );
}

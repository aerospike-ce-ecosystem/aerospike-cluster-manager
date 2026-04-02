"use client";

import { useState, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog } from "@/components/common/form-dialog";
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
  /** 클러스터 상세 페이지 테이블에서 미리 선택된 Pod 목록 */
  initialSelectedPods?: string[];
  /** 다이얼로그를 열 때 기본 오퍼레이션 타입 */
  initialKind?: OperationKind;
  /** Current operation phase — blocks new operations while InProgress */
  operationPhase?: string;
  onSuccess?: () => void;
}

export function K8sOperationTriggerDialog({
  open,
  onOpenChange,
  namespace,
  clusterName,
  pods,
  initialSelectedPods = [],
  initialKind = "WarmRestart",
  operationPhase,
  onSuccess,
}: K8sOperationTriggerDialogProps) {
  const [kind, setKind] = useState<OperationKind>(initialKind);
  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [operationId, setOperationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"configure" | "confirm" | "result">("configure");
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // 다이얼로그 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setSelectedPods(initialSelectedPods);
      setOperationId("");
      setError(null);
      setStep("configure");
      setResultMessage(null);
    }
  }, [open, initialKind, initialSelectedPods]);

  // 전체 선택 / 해제 여부 계산
  const allSelected = useMemo(
    () => pods.length > 0 && selectedPods.length === pods.length,
    [pods.length, selectedPods.length],
  );
  const someSelected = useMemo(
    () => selectedPods.length > 0 && selectedPods.length < pods.length,
    [pods.length, selectedPods.length],
  );

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedPods([]);
    } else {
      setSelectedPods(pods.map((p) => p.name));
    }
  };

  const handleTogglePod = (podName: string) => {
    setSelectedPods((prev) =>
      prev.includes(podName) ? prev.filter((n) => n !== podName) : [...prev, podName],
    );
  };

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
          ...(selectedPods.length > 0 ? { podList: selectedPods } : {}),
        };

        await api.triggerK8sClusterOperation(namespace, clusterName, request);
        const kindLabel = kind === "WarmRestart" ? "Warm restart" : "Pod restart";
        const targetLabel = selectedPods.length > 0 ? `${selectedPods.length} pod(s)` : "all pods";
        setResultMessage(`${kindLabel} operation triggered successfully for ${targetLabel}.`);
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

  const operationInProgress = operationPhase === "InProgress" || operationPhase === "Running";
  const isDisabled = operationInProgress;

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
          {operationInProgress && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                An operation is already in progress. Wait for it to complete or clear it before
                triggering a new one.
              </span>
            </div>
          )}
          {/* Operation type 선택 */}
          <div className="grid gap-2">
            <Label htmlFor="op-kind">Operation Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OperationKind)}>
              <SelectTrigger id="op-kind">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WarmRestart">Warm Restart (rolling, no data loss)</SelectItem>
                <SelectItem value="PodRestart">Pod Restart (delete and recreate pods)</SelectItem>
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

          {/* Pod 선택 영역 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target Pods</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleToggleAll}
              >
                {allSelected ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <p className="text-base-content/60 text-xs">
              Choose specific pods for the operation. If none are selected, the operation applies to
              all pods (cluster-wide).
            </p>
            <div className="max-h-[240px] overflow-y-auto rounded border p-2">
              {pods.length === 0 ? (
                <p className="text-base-content/60 py-2 text-center text-xs">No pods available</p>
              ) : (
                <div className="space-y-1">
                  {/* 전체 선택 체크박스 (헤더) */}
                  <label className="bg-base-200/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onCheckedChange={handleToggleAll}
                      aria-label="Select all pods"
                    />
                    <span className="text-base-content/80 text-xs">All Pods ({pods.length})</span>
                  </label>
                  {/* 개별 Pod 체크박스 */}
                  {pods.map((pod) => (
                    <label
                      key={pod.name}
                      className="hover:bg-base-200/30 flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors"
                    >
                      <Checkbox
                        checked={selectedPods.includes(pod.name)}
                        onCheckedChange={() => handleTogglePod(pod.name)}
                        aria-label={`Select ${pod.name}`}
                      />
                      <span className="flex-1 truncate font-mono text-xs">{pod.name}</span>
                      <Badge
                        variant="outline"
                        className={
                          pod.isReady
                            ? "bg-success/10 text-success border-success/20 text-[10px]"
                            : "bg-warning/10 text-warning border-warning/20 text-[10px]"
                        }
                      >
                        {pod.isReady ? "Ready" : "NotReady"}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedPods.length > 0 && (
              <p className="text-xs text-amber-600">
                {selectedPods.length} pod{selectedPods.length !== 1 ? "s" : ""} selected for{" "}
                {kind === "WarmRestart" ? "warm restart" : "restart"}
              </p>
            )}
          </div>

          {/* 오퍼레이션 타입별 안내 */}
          {kind === "WarmRestart" && (
            <div className="bg-info/5 border-info/20 rounded border p-3">
              <p className="text-info text-xs">
                Warm restart applies configuration changes without a full pod restart. Each pod is
                restarted one at a time in a rolling manner. This operation does not cause data
                loss.
              </p>
            </div>
          )}
          {kind === "PodRestart" && (
            <div className="rounded border border-amber-500/10 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-600">
                Pod restart deletes and recreates pods. This is more disruptive than a warm restart
                and will temporarily reduce cluster capacity while pods are being recreated.
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
                {selectedPods.length > 0
                  ? `${selectedPods.length} selected`
                  : "All pods (cluster-wide)"}
              </span>
            </div>
          </div>

          {selectedPods.length > 0 && (
            <div>
              <p className="text-base-content/60 mb-1 text-xs">Selected pods:</p>
              <div className="flex flex-wrap gap-1">
                {selectedPods.map((podName) => {
                  const pod = pods.find((p) => p.name === podName);
                  return (
                    <Badge key={podName} variant="outline" className="gap-1 font-mono text-[11px]">
                      {podName}
                      {pod && (
                        <span className={pod.isReady ? "text-green-500" : "text-amber-500"}>
                          {pod.isReady ? "\u2713" : "\u26A0"}
                        </span>
                      )}
                    </Badge>
                  );
                })}
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

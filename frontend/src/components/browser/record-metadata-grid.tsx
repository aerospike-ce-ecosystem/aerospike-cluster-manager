"use client";

import { Database, Layers, KeyRound, Hash, RefreshCw, Clock, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AerospikeRecord } from "@/lib/api/types";
import { NEVER_EXPIRE_TTL, formatTTLHuman } from "@/lib/formatters";

interface RecordMetadataGridProps {
  record?: AerospikeRecord | null;
  mode: "view" | "edit" | "create";
  pk?: string;
  onPKChange?: (pk: string) => void;
  ttl?: string;
  onTTLChange?: (ttl: string) => void;
  disabled?: boolean;
  namespace?: string;
  setName?: string;
  onSetNameChange?: (setName: string) => void;
}

function MetaLabel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="text-base-content/70 flex items-center gap-1.5 text-[11px]">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="font-mono tracking-wider">{label}</span>
    </div>
  );
}

export function RecordMetadataGrid({
  record,
  mode,
  pk,
  onPKChange,
  ttl,
  onTTLChange,
  disabled,
  namespace,
  setName,
  onSetNameChange,
}: RecordMetadataGridProps) {
  const ns = record?.key.namespace ?? namespace ?? "";
  const set = record?.key.set ?? setName ?? "";
  const displayPK = mode === "view" ? (record?.key.pk ?? "") : (pk ?? "");
  const displayTTL = record?.meta.ttl ?? 0;

  return (
    <section>
      <h4 className="text-base-content/65 mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase">
        Record Info
        <span className="bg-base-300 h-px flex-1" />
      </h4>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 font-mono text-[13px] sm:grid-cols-2">
        {/* Namespace */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={Database} label="Namespace" />
          <span className="text-base-content/80 ml-auto">{ns}</span>
        </div>

        {/* Generation */}
        {mode === "view" && record && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={RefreshCw} label="Generation" />
            <span className="ml-auto">{record.meta.generation}</span>
          </div>
        )}
        {mode !== "view" && <div />}

        {/* Set */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={Layers} label="Set" />
          {mode === "create" && onSetNameChange ? (
            <Input
              placeholder="Set name"
              value={set}
              onChange={(e) => onSetNameChange(e.target.value)}
              disabled={disabled}
              className="border-base-300/50 focus-visible:ring-accent/30 ml-auto h-7 w-48 font-mono text-xs"
            />
          ) : (
            <span className="text-base-content/80 ml-auto">{set}</span>
          )}
        </div>

        {/* TTL */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={Clock} label="TTL" />
          {mode === "view" ? (
            <span className="ml-auto">
              {formatTTLHuman(displayTTL)}
              {displayTTL > 0 && displayTTL !== -1 && displayTTL !== NEVER_EXPIRE_TTL && (
                <span className="text-base-content/65 ml-1 text-[11px]">({displayTTL}s)</span>
              )}
            </span>
          ) : (
            <Input
              type="number"
              placeholder="0 = default"
              value={ttl ?? "0"}
              onChange={(e) => onTTLChange?.(e.target.value)}
              disabled={disabled}
              className="border-base-300/50 focus-visible:ring-accent/30 ml-auto h-7 w-32 font-mono text-xs"
            />
          )}
        </div>

        {/* PK */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={KeyRound} label="PK" />
          {mode === "view" ? (
            <span className="text-primary ml-auto font-semibold">{displayPK}</span>
          ) : (
            <Input
              placeholder="Record key"
              value={pk ?? ""}
              onChange={(e) => onPKChange?.(e.target.value)}
              disabled={mode === "edit" || disabled}
              className="border-base-300/50 focus-visible:ring-accent/30 ml-auto h-7 w-48 font-mono text-xs"
            />
          )}
        </div>

        {/* Digest */}
        {mode === "view" && record?.key.digest && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={Hash} label="Digest" />
            <span className="text-base-content/70 ml-auto text-xs break-all">
              {record.key.digest}
            </span>
          </div>
        )}

        {/* Last Updated */}
        {mode === "view" && record?.meta.lastUpdateMs && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={CalendarClock} label="Updated" />
            <span className="text-base-content/70 ml-auto text-[12px]">
              {new Date(record.meta.lastUpdateMs).toISOString()}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

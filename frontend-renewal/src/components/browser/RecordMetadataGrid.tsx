"use client"

import {
  RiCalendarLine,
  RiDatabase2Line,
  RiHashtag,
  RiKey2Line,
  RiRefreshLine,
  RiStackLine,
  RiTimeLine,
} from "@remixicon/react"
import type { ComponentType } from "react"

import { Input } from "@/components/Input"
import type { AerospikeRecord } from "@/lib/types/record"

import { NEVER_EXPIRE_TTL, formatTTLHuman } from "./_utils"

interface RecordMetadataGridProps {
  record?: AerospikeRecord | null
  mode: "view" | "edit" | "create"
  pk?: string
  onPKChange?: (pk: string) => void
  ttl?: string
  onTTLChange?: (ttl: string) => void
  disabled?: boolean
  namespace?: string
  setName?: string
  onSetNameChange?: (setName: string) => void
}

function MetaLabel({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{
    className?: string
    "aria-hidden"?: boolean | "true" | "false"
  }>
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="font-mono tracking-wider">{label}</span>
    </div>
  )
}

/**
 * Compact metadata grid rendered above the bins editor / viewer. Handles
 * view (read-only), edit (edit PK disabled + TTL input), and create (PK + TTL
 * + optional set-name inputs) modes.
 */
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
  const ns = record?.key.namespace ?? namespace ?? ""
  const set = record?.key.set ?? setName ?? ""
  const displayPK = mode === "view" ? (record?.key.pk ?? "") : (pk ?? "")
  const displayTTL = record?.meta.ttl ?? 0

  return (
    <section>
      <h4 className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
        Record Info
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </h4>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 font-mono text-[13px] sm:grid-cols-2">
        {/* Namespace */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={RiDatabase2Line} label="Namespace" />
          <span className="ml-auto text-gray-700 dark:text-gray-300">{ns}</span>
        </div>

        {/* Generation */}
        {mode === "view" && record && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={RiRefreshLine} label="Generation" />
            <span className="ml-auto">{record.meta.generation}</span>
          </div>
        )}
        {mode !== "view" && <div />}

        {/* Set */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={RiStackLine} label="Set" />
          {mode === "create" && onSetNameChange ? (
            <Input
              placeholder="Set name"
              value={set}
              onChange={(e) => onSetNameChange(e.target.value)}
              disabled={disabled}
              className="ml-auto h-7 w-48 font-mono text-xs"
            />
          ) : (
            <span className="ml-auto text-gray-700 dark:text-gray-300">
              {set}
            </span>
          )}
        </div>

        {/* TTL */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={RiTimeLine} label="TTL" />
          {mode === "view" ? (
            <span className="ml-auto">
              {formatTTLHuman(displayTTL)}
              {displayTTL > 0 &&
                displayTTL !== -1 &&
                displayTTL !== NEVER_EXPIRE_TTL && (
                  <span className="ml-1 text-[11px] text-gray-500 dark:text-gray-400">
                    ({displayTTL}s)
                  </span>
                )}
            </span>
          ) : (
            <Input
              type="number"
              placeholder="0 = default"
              value={ttl ?? "0"}
              onChange={(e) => onTTLChange?.(e.target.value)}
              disabled={disabled}
              className="ml-auto h-7 w-32 font-mono text-xs"
            />
          )}
        </div>

        {/* PK */}
        <div className="flex items-center gap-3">
          <MetaLabel icon={RiKey2Line} label="PK" />
          {mode === "view" ? (
            <span className="ml-auto font-semibold text-indigo-600 dark:text-indigo-400">
              {displayPK}
            </span>
          ) : (
            <Input
              placeholder="Record key"
              value={pk ?? ""}
              onChange={(e) => onPKChange?.(e.target.value)}
              disabled={mode === "edit" || disabled}
              className="ml-auto h-7 w-48 font-mono text-xs"
            />
          )}
        </div>

        {/* Digest */}
        {mode === "view" && record?.key.digest && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={RiHashtag} label="Digest" />
            <span className="ml-auto break-all text-xs text-gray-600 dark:text-gray-400">
              {record.key.digest}
            </span>
          </div>
        )}

        {/* Last Updated */}
        {mode === "view" && record?.meta.lastUpdateMs && (
          <div className="flex items-center gap-3">
            <MetaLabel icon={RiCalendarLine} label="Updated" />
            <span className="ml-auto text-[12px] text-gray-600 dark:text-gray-400">
              {new Date(record.meta.lastUpdateMs).toISOString()}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

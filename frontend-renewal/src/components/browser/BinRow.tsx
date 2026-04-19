"use client"

import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiArrowUpSLine,
  RiDeleteBin2Line,
} from "@remixicon/react"
import { useCallback, useRef, useState } from "react"

import { Input } from "@/components/Input"
import { JsonViewer } from "@/components/common/JsonViewer"
import {
  BIN_TYPES,
  BIN_TYPE_BORDER_COLORS,
  type BinType,
} from "@/lib/constants"
import type { BinValue } from "@/lib/types/record"
import { cx } from "@/lib/utils"

import type { BinEntry } from "./_utils"
import { BinTypeBadge } from "./BinTypeBadge"

/* ─── BinTypeSelect (custom dropdown) ─────────────── */

function BinTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: BinType
  onChange: (type: BinType) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  const openDropdown = useCallback(() => {
    setOpen(true)
    setHighlighted(BIN_TYPES.indexOf(value))
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          openDropdown()
        }
        return
      }
      switch (e.key) {
        case "Escape":
          e.preventDefault()
          setOpen(false)
          break
        case "ArrowDown":
          e.preventDefault()
          setHighlighted((h) => (h + 1) % BIN_TYPES.length)
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlighted((h) => (h - 1 + BIN_TYPES.length) % BIN_TYPES.length)
          break
        case "Enter":
        case " ":
          e.preventDefault()
          if (highlighted >= 0) {
            onChange(BIN_TYPES[highlighted])
            setOpen(false)
          }
          break
      }
    },
    [open, highlighted, onChange, openDropdown],
  )

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          "flex h-7 w-full items-center justify-between rounded-md border border-gray-300 px-2 text-xs transition-colors dark:border-gray-800",
          "hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-700/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="truncate font-mono">{value}</span>
        {open ? (
          <RiArrowUpSLine
            aria-hidden
            className="ml-1 size-3 shrink-0 text-gray-500"
          />
        ) : (
          <RiArrowDownSLine
            aria-hidden
            className="ml-1 size-3 shrink-0 text-gray-500"
          />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-950"
          >
            {BIN_TYPES.map((t, i) => (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={t === value}
                onClick={() => {
                  onChange(t)
                  setOpen(false)
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={cx(
                  "flex w-full items-center px-2 py-1.5 font-mono text-xs transition-colors",
                  t === value
                    ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400"
                    : "text-gray-900 hover:bg-gray-100 dark:text-gray-50 dark:hover:bg-gray-800/70",
                  i === highlighted &&
                    t !== value &&
                    "bg-gray-100 dark:bg-gray-800/70",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── View mode helpers ───────────────────────────── */

function isComplex(value: BinValue): boolean {
  return value !== null && typeof value === "object"
}

function complexSummary(value: BinValue, type: BinType): string {
  if (type === "geojson") {
    const obj = value as Record<string, unknown>
    return String(obj?.type ?? "GeoJSON")
  }
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === "object" && value !== null)
    return `{${Object.keys(value).length} keys}`
  return ""
}

function PrimitiveValue({ value, type }: { value: BinValue; type: BinType }) {
  if (type === "string")
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        &quot;{String(value)}&quot;
      </span>
    )
  if (type === "integer" || type === "float")
    return (
      <span className="text-blue-700 dark:text-blue-400">{String(value)}</span>
    )
  if (type === "bool") {
    const b = Boolean(value)
    return (
      <span
        className={
          b
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }
      >
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
        {String(b)}
      </span>
    )
  }
  return (
    <span className="text-gray-500 dark:text-gray-400">{String(value)}</span>
  )
}

/* ─── ViewBinRow ──────────────────────────────────── */

interface ViewBinRowProps {
  index: number
  name: string
  type: BinType
  value: BinValue
}

function ViewBinRow({ index, name, type, value }: ViewBinRowProps) {
  const [expanded, setExpanded] = useState(false)
  const complex = isComplex(value)

  return (
    <div className={cx("border-l-2", BIN_TYPE_BORDER_COLORS[type])}>
      <div className="grid grid-cols-[2rem_1fr_5rem_2fr_2rem] items-center gap-2 px-3 py-2">
        <span className="text-right font-mono text-[11px] text-gray-400 dark:text-gray-600">
          #{index}
        </span>
        <span className="truncate font-mono text-[13px] font-semibold">
          {name}
        </span>
        <BinTypeBadge type={type} />
        <div className="min-w-0 font-mono text-[13px]">
          {complex ? (
            <button
              type="button"
              className="flex items-center gap-1 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
              onClick={() => setExpanded((p) => !p)}
            >
              {expanded ? (
                <RiArrowDownSLine aria-hidden className="size-3 shrink-0" />
              ) : (
                <RiArrowRightSLine aria-hidden className="size-3 shrink-0" />
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {complexSummary(value, type)}
              </span>
            </button>
          ) : (
            <PrimitiveValue value={value} type={type} />
          )}
        </div>
        <div />
      </div>
      {complex && expanded && (
        <div className="mx-3 mb-2 max-h-[300px] overflow-auto rounded-md border border-gray-200 p-2 dark:border-gray-800">
          <JsonViewer data={value} />
        </div>
      )}
    </div>
  )
}

/* ─── EditBinRow ──────────────────────────────────── */

interface EditBinRowProps {
  index: number
  bin: BinEntry
  onUpdate: (id: string, field: keyof BinEntry, val: string) => void
  onRemove: (id: string) => void
  canRemove: boolean
  useCodeEditor: boolean
  onToggleCodeEditor: (id: string) => void
  saving: boolean
}

function EditBinRow({
  index,
  bin,
  onUpdate,
  onRemove,
  canRemove,
  useCodeEditor: showCode,
  onToggleCodeEditor,
  saving,
}: EditBinRowProps) {
  const isComplexType = ["list", "map", "geojson"].includes(bin.type)

  return (
    <div className={cx("border-l-2", BIN_TYPE_BORDER_COLORS[bin.type])}>
      <div className="grid grid-cols-[2rem_1fr_6rem_2fr_2rem] items-start gap-2 px-3 py-2">
        <span className="pt-1.5 text-right font-mono text-[11px] text-gray-400 dark:text-gray-600">
          #{index}
        </span>
        <Input
          placeholder="Bin name"
          value={bin.name}
          onChange={(e) => onUpdate(bin.id, "name", e.target.value)}
          disabled={saving}
          className="h-7 font-mono text-xs"
        />
        <BinTypeSelect
          value={bin.type}
          onChange={(t) => onUpdate(bin.id, "type", t)}
          disabled={saving}
        />
        <div className="min-w-0">
          {isComplexType && showCode ? (
            // FIXME(stream-a): upgrade to code editor later — using textarea for JSON editing
            <textarea
              value={bin.value}
              onChange={(e) => onUpdate(bin.id, "value", e.target.value)}
              disabled={saving}
              spellCheck={false}
              rows={5}
              className="block w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
            />
          ) : (
            <Input
              placeholder={
                bin.type === "bool"
                  ? "true / false"
                  : bin.type === "integer" || bin.type === "float"
                    ? "0"
                    : "Value"
              }
              value={bin.value}
              onChange={(e) => onUpdate(bin.id, "value", e.target.value)}
              disabled={saving}
              className="h-7 font-mono text-xs"
            />
          )}
          {isComplexType && (
            <button
              type="button"
              className="mt-1 font-mono text-[10px] text-gray-500 transition-colors hover:text-indigo-600 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-400 dark:hover:text-indigo-400"
              onClick={() => onToggleCodeEditor(bin.id)}
              disabled={saving}
            >
              {showCode ? "↩ simple input" : "⌨ JSON textarea"}
            </button>
          )}
        </div>
        <div>
          {canRemove && (
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              onClick={() => onRemove(bin.id)}
              disabled={saving}
              aria-label="Remove bin"
            >
              <RiDeleteBin2Line aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── BinRow (unified export) ─────────────────────── */

export type { ViewBinRowProps, EditBinRowProps }

export function BinRow(
  props:
    | ({ mode: "view" } & ViewBinRowProps)
    | ({ mode: "edit" } & EditBinRowProps),
) {
  if (props.mode === "view") {
    const { mode: _mode, ...rest } = props
    return <ViewBinRow {...rest} />
  }
  const { mode: _mode, ...rest } = props
  return <EditBinRow {...rest} />
}

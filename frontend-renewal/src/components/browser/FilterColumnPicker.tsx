"use client"

import {
  RiBracesLine,
  RiCodeSSlashLine,
  RiDatabase2Line,
  RiHashtag,
  RiListCheck,
  RiMapPin2Line,
  RiSearchLine,
  RiText,
  RiToggleLine,
} from "@remixicon/react"
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react"

import type { BinDataType } from "@/lib/types/query"
import { cx } from "@/lib/utils"

type IconComponent = ComponentType<{
  className?: string
  "aria-hidden"?: boolean | "true" | "false"
}>

const TYPE_ICONS: Record<BinDataType, IconComponent> = {
  integer: RiHashtag,
  float: RiHashtag,
  string: RiText,
  bool: RiToggleLine,
  geo: RiMapPin2Line,
  list: RiListCheck,
  map: RiBracesLine,
}

const TYPE_COLORS: Record<BinDataType, string> = {
  integer: "text-blue-500",
  float: "text-cyan-500",
  string: "text-emerald-500",
  bool: "text-amber-500",
  geo: "text-rose-500",
  list: "text-violet-500",
  map: "text-orange-500",
}

interface FilterColumnPickerProps {
  bins: Array<{ name: string; type: BinDataType }>
  onSelect: (binName: string, binType: BinDataType) => void
  onClose: () => void
}

/**
 * Dropdown surface that lists indexed bins available as filter columns. Only
 * bins backed by a secondary index appear here because the backend filter
 * endpoint requires an index on the filter bin.
 */
export function FilterColumnPicker({
  bins,
  onSelect,
  onClose,
}: FilterColumnPickerProps) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return bins
    const q = search.toLowerCase()
    return bins.filter((b) => b.name.toLowerCase().includes(q))
  }, [bins, search])

  return (
    <div className="w-[240px]">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <RiSearchLine
          aria-hidden
          className="size-3.5 shrink-0 text-gray-500"
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter by..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-xs outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
        />
      </div>

      <div className="flex items-center gap-1.5 border-b border-gray-200 px-3 py-1.5 dark:border-gray-800">
        <RiDatabase2Line aria-hidden className="size-3 text-amber-500" />
        <span className="text-[10px] text-gray-500 dark:text-gray-400">
          Secondary Index required
        </span>
      </div>

      <div className="max-h-[240px] overflow-auto py-1">
        {bins.length === 0 ? (
          <div className="space-y-1 px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
            <p>No indexed bins found</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-600">
              Create a secondary index on the Indexes tab to enable filtering
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
            No matching bins
          </div>
        ) : (
          filtered.map((bin) => {
            const Icon = TYPE_ICONS[bin.type] ?? RiCodeSSlashLine
            const color = TYPE_COLORS[bin.type] ?? "text-gray-500"
            return (
              <button
                key={bin.name}
                type="button"
                className={cx(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors",
                  "hover:bg-gray-100 dark:hover:bg-gray-800/70",
                )}
                onClick={() => {
                  onSelect(bin.name, bin.type)
                  onClose()
                }}
              >
                <Icon
                  aria-hidden
                  className={cx("size-3.5 shrink-0", color)}
                />
                <span className="truncate font-mono">{bin.name}</span>
                <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-600">
                  {bin.type}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

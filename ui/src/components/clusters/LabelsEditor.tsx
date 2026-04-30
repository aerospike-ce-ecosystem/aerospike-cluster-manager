"use client"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import {
  DEFAULT_ENV_VALUE,
  ENV_LABEL_KEY,
  type LabelEntry,
} from "@/components/clusters/labels"
import { cx } from "@/lib/utils"
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react"
import React from "react"

interface LabelsEditorProps {
  value: LabelEntry[]
  onChange: (next: LabelEntry[]) => void
  idPrefix?: string
}

export function LabelsEditor({
  value,
  onChange,
  idPrefix = "label",
}: LabelsEditorProps) {
  const entries =
    value.length > 0
      ? value
      : [{ key: ENV_LABEL_KEY, value: DEFAULT_ENV_VALUE }]

  // Stable per-row ids so deleting / reordering rows doesn't reuse another
  // row's React key (which would carry over input focus / cursor state).
  // We track ids by reference using a WeakMap keyed on the entry object.
  const idMap = React.useRef(new WeakMap<LabelEntry, number>())
  const nextId = React.useRef(0)
  const rowKey = (entry: LabelEntry): number => {
    const cached = idMap.current.get(entry)
    if (cached !== undefined) return cached
    const id = nextId.current++
    idMap.current.set(entry, id)
    return id
  }

  const update = (index: number, patch: Partial<LabelEntry>) => {
    const next = entries.map((entry, i) => {
      if (i !== index) return entry
      const merged = { ...entry, ...patch }
      // Preserve the row's stable id across edits.
      const existing = idMap.current.get(entry)
      if (existing !== undefined) idMap.current.set(merged, existing)
      return merged
    })
    onChange(next)
  }

  const remove = (index: number) => {
    if (entries[index]?.key === ENV_LABEL_KEY) return
    onChange(entries.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...entries, { key: "", value: "" }])
  }

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex items-end justify-between">
        <Label>Labels</Label>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={add}
        >
          <RiAddLine className="mr-1 size-3.5" aria-hidden="true" />
          Add label
        </Button>
      </div>
      <div className="flex flex-col gap-y-2">
        {entries.map((entry, index) => {
          const locked = entry.key === ENV_LABEL_KEY
          return (
            <div key={rowKey(entry)} className="flex items-center gap-2">
              <Input
                aria-label={`${idPrefix} key ${index}`}
                value={entry.key}
                onChange={(e) => update(index, { key: e.target.value })}
                placeholder={locked ? ENV_LABEL_KEY : "key (e.g. idc)"}
                disabled={locked}
                className={cx("flex-1", locked && "opacity-70")}
              />
              <span className="text-gray-400" aria-hidden="true">
                =
              </span>
              <Input
                aria-label={`${idPrefix} value ${index}`}
                value={entry.value}
                onChange={(e) => update(index, { value: e.target.value })}
                placeholder={locked ? DEFAULT_ENV_VALUE : "value (e.g. 평촌)"}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={
                  locked ? "env label cannot be removed" : "Remove label"
                }
                title={locked ? "env label cannot be removed" : "Remove label"}
                disabled={locked}
                onClick={() => remove(index)}
                className="h-9 px-2"
              >
                <RiDeleteBinLine className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-500">
        The <code className="font-mono">env</code> label is required and used to
        group clusters in the list view.
      </p>
    </div>
  )
}

export default LabelsEditor

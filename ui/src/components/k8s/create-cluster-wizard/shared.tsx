"use client"

import { useState } from "react"

import { Button } from "@/components/Button"
import { Input } from "@/components/Input"
import { cx } from "@/lib/utils"

interface SectionProps {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function Section({
  title,
  summary,
  defaultOpen = false,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-md border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            {title}
          </span>
          {summary && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {summary}
            </span>
          )}
        </div>
        <span
          aria-hidden="true"
          className={cx(
            "text-sm text-gray-500 transition-transform",
            open ? "rotate-90" : "",
          )}
        >
          ▸
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-200 p-4 dark:border-gray-800">
          {children}
        </div>
      )}
    </section>
  )
}

interface KeyValueEditorProps {
  value: Record<string, string> | null | undefined
  onChange: (next: Record<string, string> | null) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  label?: string
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
  label,
}: KeyValueEditorProps) {
  const entries = Object.entries(value ?? {})

  const setEntry = (i: number, k: string, v: string) => {
    const next: Record<string, string> = {}
    entries.forEach(([ek, ev], idx) => {
      if (idx === i) next[k] = v
      else next[ek] = ev
    })
    onChange(Object.keys(next).length ? next : null)
  }

  const removeEntry = (i: number) => {
    const next: Record<string, string> = {}
    entries.forEach(([ek, ev], idx) => {
      if (idx !== i) next[ek] = ev
    })
    onChange(Object.keys(next).length ? next : null)
  }

  const addEntry = () => {
    const next = { ...(value ?? {}) }
    let k = "key"
    let i = 1
    while (k in next) {
      k = `key${i++}`
    }
    next[k] = ""
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </div>
      )}
      {entries.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-500">No entries.</p>
      )}
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={k}
            placeholder={keyPlaceholder}
            onChange={(e) => setEntry(i, e.target.value, v)}
            className="flex-1"
          />
          <Input
            value={v}
            placeholder={valuePlaceholder}
            onChange={(e) => setEntry(i, k, e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeEntry(i)}
            className="text-red-600 hover:text-red-700"
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={addEntry}
        className="self-start"
      >
        + Add
      </Button>
    </div>
  )
}

interface ChipListEditorProps {
  value: string[] | null | undefined
  onChange: (next: string[] | null) => void
  placeholder?: string
  label?: string
}

export function ChipListEditor({
  value,
  onChange,
  placeholder = "value",
  label,
}: ChipListEditorProps) {
  const list = value ?? []

  const setAt = (i: number, s: string) => {
    const next = list.map((v, idx) => (idx === i ? s : v))
    onChange(next.length ? next : null)
  }

  const removeAt = (i: number) => {
    const next = list.filter((_, idx) => idx !== i)
    onChange(next.length ? next : null)
  }

  const add = () => {
    onChange([...(list ?? []), ""])
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </div>
      )}
      {list.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-500">None.</p>
      )}
      {list.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => setAt(i, e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeAt(i)}
            className="text-red-600 hover:text-red-700"
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={add}
        className="self-start"
      >
        + Add
      </Button>
    </div>
  )
}

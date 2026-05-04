"use client"

import { RiInformationLine } from "@remixicon/react"

export interface InfoBannerProps {
  title?: string
  children: React.ReactNode
}

export function InfoBanner({ title, children }: InfoBannerProps) {
  return (
    <div
      role="status"
      className="flex gap-2 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300"
    >
      <RiInformationLine
        className="mt-0.5 size-3.5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-0.5">
        {title && <span className="font-semibold">{title}</span>}
        <span>{children}</span>
      </div>
    </div>
  )
}

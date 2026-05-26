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
      className="dark:border-primary-30/50 dark:bg-primary-10/40 flex gap-2 rounded border border-primary-90 bg-primary-95 px-3 py-2 text-xs text-primary-40 dark:text-primary-80"
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

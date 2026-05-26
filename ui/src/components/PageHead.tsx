import type { ReactNode } from "react"
import { cx } from "@/lib/utils"

/**
 * Page header — title + sub-text on the left, action slot on the right.
 * Renders the `.ace-page-head` styles defined in src/styles/theme.css.
 */
export function PageHead({
  title,
  sub,
  className,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cx("ace-page-head", className)}>
      <div className="lead">
        <div>
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

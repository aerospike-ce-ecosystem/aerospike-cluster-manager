import { Badge } from "@/components/Badge"
import { BIN_TYPE_COLORS, type BinType } from "@/lib/constants"
import { cx } from "@/lib/utils"

interface BinTypeBadgeProps {
  type: BinType
  className?: string
}

/**
 * Color-coded type pill rendered next to bin names in the record editor and
 * record detail view. Uses the token palette from `lib/constants`.
 */
export function BinTypeBadge({ type, className }: BinTypeBadgeProps) {
  return (
    <Badge
      variant="neutral"
      className={cx(
        "px-1.5 py-0 font-mono text-[10px]",
        BIN_TYPE_COLORS[type],
        className,
      )}
    >
      {type}
    </Badge>
  )
}

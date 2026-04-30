import { TableCell, TableRow } from "@/components/Table"

// TableSkeleton renders pulse-shimmer placeholder rows that mirror the shape
// of the table while the initial fetch is in flight. Use this inside a
// <TableBody> when `loading && !data` so users see structure instead of an
// empty card.
export function TableSkeleton({
  rows = 5,
  cols,
  cellWidth = "w-20",
}: {
  rows?: number
  cols: number
  // Tailwind width class for the inner skeleton bar. Tweak per page if needed.
  cellWidth?: string
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <div
                className={`h-3 ${cellWidth} animate-pulse rounded bg-gray-200 dark:bg-gray-800`}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

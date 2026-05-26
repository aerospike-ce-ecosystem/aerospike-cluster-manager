"use client"

/**
 * GuideMarkdown — a small, dependency-free Markdown renderer for operational
 * guides.
 *
 * Why hand-rolled: the project pins Tailwind 3 / Next 14 to match Tremor and
 * is deliberately conservative about new dependencies. Operational guides only
 * need a well-known subset of Markdown — headings, paragraphs, bold/italic,
 * inline code, fenced code blocks, ordered/unordered lists, blockquotes,
 * horizontal rules and simple pipe tables — so a ~200-line renderer is a
 * better trade than pulling in `react-markdown` + `remark` + their transitive
 * tree.
 *
 * Safety: output is built from React elements only — there is no
 * `dangerouslySetInnerHTML` anywhere, so guide content cannot inject markup or
 * scripts. Link `href`s are restricted to http(s) / root-relative / anchor.
 */

import React from "react"

const INLINE_RE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/

function isSafeHref(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) ||
    // Root-relative, but not protocol-relative ("//evil.com" resolves to an
    // off-site origin and would be an open redirect).
    (url.startsWith("/") && !url.startsWith("//")) ||
    url.startsWith("#")
  )
}

/** Render inline spans: `code`, **bold**, *italic*, [text](url). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const m = INLINE_RE.exec(rest)
    if (!m) {
      nodes.push(rest)
      break
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-gray-800 dark:text-gray-200"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong
          key={key}
          className="font-semibold text-gray-900 dark:text-gray-50"
        >
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)
      if (lm && isSafeHref(lm[2])) {
        nodes.push(
          <a
            key={key}
            href={lm[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-50 underline hover:text-primary-40 dark:text-primary-65"
          >
            {lm[1]}
          </a>,
        )
      } else {
        nodes.push(lm ? lm[1] : token)
      }
    }
    rest = rest.slice(m.index + token.length)
  }
  return nodes
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-5 text-xl font-semibold text-gray-900 dark:text-gray-50",
  2: "mt-5 text-lg font-semibold text-gray-900 dark:text-gray-50",
  3: "mt-4 text-base font-semibold text-gray-900 dark:text-gray-50",
  4: "mt-4 text-sm font-semibold text-gray-900 dark:text-gray-50",
  5: "mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300",
  6: "mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500",
}

function isBlockStart(line: string): boolean {
  const t = line.trim()
  return (
    t === "" ||
    /^```/.test(t) ||
    /^(#{1,6})\s+/.test(line) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(t) ||
    /^>\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  )
}

function splitTableRow(row: string): string[] {
  let r = row.trim()
  if (r.startsWith("|")) r = r.slice(1)
  if (r.endsWith("|")) r = r.slice(0, -1)
  return r.split("|").map((c) => c.trim())
}

function isTableSeparator(line: string): boolean {
  // Every cell of a separator row must be a dash run (with optional :
  // alignment markers). Checking cell-by-cell avoids misclassifying a data
  // row whose cells happen to contain only dashes/colons (e.g. `| --- |`).
  if (!line.includes("-") || !line.includes("|")) return false
  return splitTableRow(line).every((c) => /^\s*:?-+:?\s*$/.test(c))
}

/** Parse a Markdown string into a flat list of block-level React elements. */
function renderBlocks(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "") {
      i++
      continue
    }
    // Fenced code block.
    if (/^```/.test(line.trim())) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i])
        i++
      }
      i++ // consume the closing fence
      blocks.push(
        <pre
          key={key++}
          className="mt-3 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs leading-relaxed text-gray-100 dark:bg-gray-800"
        >
          <code className="font-mono">{code.join("\n")}</code>
        </pre>,
      )
      continue
    }
    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(
        <hr
          key={key++}
          className="my-4 border-gray-200 dark:border-gray-800"
        />,
      )
      i++
      continue
    }
    // Heading. The tag (h1..h6) is dynamic, so build it via createElement —
    // a string-typed JSX tag has no construct signature under React 18 typings.
    const hm = /^(#{1,6})\s+(.*)$/.exec(line)
    if (hm) {
      const level = hm[1].length
      blocks.push(
        React.createElement(
          `h${level}`,
          { key: key++, className: HEADING_CLASS[level] },
          renderInline(hm[2], `h${key}`),
        ),
      )
      i++
      continue
    }
    // Blockquote.
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""))
        i++
      }
      blocks.push(
        <blockquote
          key={key++}
          className="mt-3 border-l-2 border-primary-80 pl-3 text-sm italic text-gray-600 dark:border-primary-40 dark:text-gray-400"
        >
          {renderInline(quote.join(" "), `bq${key}`)}
        </blockquote>,
      )
      continue
    }
    // Pipe table (header row + separator row + body rows).
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (
        i < lines.length &&
        lines[i].includes("|") &&
        lines[i].trim() !== ""
      ) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push(
        <div key={key++} className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className="border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-left font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
                  >
                    {renderInline(cell, `th${key}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-gray-200 px-2.5 py-1.5 text-gray-700 dark:border-gray-800 dark:text-gray-300"
                    >
                      {renderInline(cell, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""))
        i++
      }
      blocks.push(
        <ul
          key={key++}
          className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ul${key}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }
    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""))
        i++
      }
      blocks.push(
        <ol
          key={key++}
          className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `ol${key}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }
    // Paragraph — consume consecutive non-blank, non-block lines.
    const para: string[] = []
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p
        key={key++}
        className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300"
      >
        {renderInline(para.join(" "), `p${key}`)}
      </p>,
    )
  }
  return blocks
}

export function GuideMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  if (!content.trim()) {
    return (
      <p className="text-sm italic text-gray-400 dark:text-gray-600">(empty)</p>
    )
  }
  return <div className={className}>{renderBlocks(content)}</div>
}

export default GuideMarkdown

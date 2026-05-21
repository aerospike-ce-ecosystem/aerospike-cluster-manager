import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { GuideMarkdown } from "./GuideMarkdown"

describe("GuideMarkdown", () => {
  it("renders headings, bold, and inline code", () => {
    render(<GuideMarkdown content={"# Title\n\nA **bold** word and `code`."} />)
    expect(
      screen.getByRole("heading", { level: 1, name: "Title" }),
    ).toBeInTheDocument()
    expect(screen.getByText("bold").tagName).toBe("STRONG")
    expect(screen.getByText("code").tagName).toBe("CODE")
  })

  it("renders unordered and ordered list items", () => {
    render(<GuideMarkdown content={"- one\n- two\n\n1. first\n2. second"} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.getByText("first")).toBeInTheDocument()
  })

  it("renders a fenced code block verbatim", () => {
    render(<GuideMarkdown content={"```\ncreator: x\ndate: y\n```"} />)
    expect(screen.getByText(/creator: x/)).toBeInTheDocument()
  })

  it("renders a pipe table", () => {
    render(
      <GuideMarkdown
        content={"| Env | Rule |\n| --- | --- |\n| test | in-memory |"}
      />,
    )
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("Env")).toBeInTheDocument()
    expect(screen.getByText("in-memory")).toBeInTheDocument()
  })

  it("renders safe links but drops unsafe href schemes", () => {
    render(
      <GuideMarkdown
        content={"[ok](https://example.com) then [bad](javascript:alert)"}
      />,
    )
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com",
    )
    // A javascript: href is not rendered as a link — only its text survives.
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument()
    expect(screen.getByText(/bad/)).toBeInTheDocument()
  })

  it("shows an empty placeholder for blank content", () => {
    render(<GuideMarkdown content={"   "} />)
    expect(screen.getByText("(empty)")).toBeInTheDocument()
  })
})

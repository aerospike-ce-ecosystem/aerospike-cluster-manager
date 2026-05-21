import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useGuides } from "@/hooks/use-guides"
import { useWorkspaces } from "@/hooks/use-workspaces"
import type { Guide } from "@/lib/types/guide"

import GuidesPage from "./page"

vi.mock("@/hooks/use-guides", () => ({ useGuides: vi.fn() }))
vi.mock("@/hooks/use-workspaces", () => ({ useWorkspaces: vi.fn() }))

const mockedGuides = vi.mocked(useGuides)
const mockedWorkspaces = vi.mocked(useWorkspaces)

beforeEach(() => {
  mockedWorkspaces.mockReturnValue({
    data: [],
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  })
})

describe("GuidesPage", () => {
  it("shows a 'not registered' state for both guides when none exist", () => {
    mockedGuides.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<GuidesPage />)

    expect(
      screen.getByRole("heading", { name: "Data-plane guide" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Control-plane guide" }),
    ).toBeInTheDocument()
    // One "Not registered" badge per absent guide.
    expect(screen.getAllByText("Not registered")).toHaveLength(2)
  })

  it("renders the Markdown body when a guide is registered", () => {
    const dataPlane: Guide = {
      workspaceId: "ws-default",
      guideType: "data-plane",
      title: "DP policy",
      content: "# Data policy\n\nTTL <= 7 days",
      createdAt: "2026-05-21T00:00:00Z",
      updatedAt: "2026-05-21T00:00:00Z",
      updatedBy: "admin",
    }
    mockedGuides.mockReturnValue({
      data: [dataPlane],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<GuidesPage />)

    expect(screen.getByText("DP policy")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { level: 1, name: "Data policy" }),
    ).toBeInTheDocument()
    // data-plane is registered, control-plane is still absent.
    expect(screen.getByText("Registered")).toBeInTheDocument()
    expect(screen.getByText("Not registered")).toBeInTheDocument()
  })
})

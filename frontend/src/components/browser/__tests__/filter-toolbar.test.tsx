import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterToolbar } from "../filter-toolbar";
import { useFilterStore } from "@/stores/filter-store";

// Mock showModal/close for jsdom
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

describe("FilterToolbar", () => {
  const defaultProps = {
    connId: "conn-1",
    namespace: "test",
    set: "demo",
    availableBins: [
      { name: "age", type: "integer" as const },
      { name: "name", type: "string" as const },
    ],
    onExecute: vi.fn(),
    onPKLookup: vi.fn(),
    loading: false,
    error: null,
  };

  beforeEach(() => {
    // Reset the filter store before each test
    useFilterStore.getState().reset();
    vi.clearAllMocks();
  });

  it("renders Add filter button", () => {
    render(<FilterToolbar {...defaultProps} />);
    expect(screen.getByText("Add filter")).toBeInTheDocument();
  });

  it("does not show Clear all button when no filters exist", () => {
    render(<FilterToolbar {...defaultProps} />);
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });

  it("shows Clear all button when filters exist", () => {
    // Add a condition via the store directly
    useFilterStore.getState().addCondition("age", "integer");
    render(<FilterToolbar {...defaultProps} />);
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("clears all filters when Clear all is clicked", async () => {
    const user = userEvent.setup();
    useFilterStore.getState().addCondition("age", "integer");
    render(<FilterToolbar {...defaultProps} />);
    await user.click(screen.getByText("Clear all"));
    expect(useFilterStore.getState().conditions).toHaveLength(0);
  });

  it("calls onExecute when Clear all is clicked", async () => {
    const onExecute = vi.fn();
    const user = userEvent.setup();
    useFilterStore.getState().addCondition("age", "integer");
    render(<FilterToolbar {...defaultProps} onExecute={onExecute} />);
    await user.click(screen.getByText("Clear all"));
    expect(onExecute).toHaveBeenCalled();
  });

  it("shows PK search input when PK button is clicked", async () => {
    const user = userEvent.setup();
    render(<FilterToolbar {...defaultProps} />);
    // Click PK toggle button
    await user.click(screen.getByTitle("Primary Key Lookup"));
    expect(screen.getByPlaceholderText("Primary key...")).toBeInTheDocument();
  });

  it("calls onPKLookup when Enter is pressed in PK input", async () => {
    const onPKLookup = vi.fn();
    const user = userEvent.setup();
    render(<FilterToolbar {...defaultProps} onPKLookup={onPKLookup} />);
    // Expand PK input
    await user.click(screen.getByTitle("Primary Key Lookup"));
    const pkInput = screen.getByPlaceholderText("Primary key...");
    await user.type(pkInput, "my-key{Enter}");
    expect(onPKLookup).toHaveBeenCalledWith("my-key");
  });

  it("shows available bin count badge", () => {
    render(<FilterToolbar {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows error message when error prop is provided", () => {
    render(<FilterToolbar {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});

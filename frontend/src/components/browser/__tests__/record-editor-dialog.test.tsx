import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordEditorDialog, parseBinValue, detectBinType } from "../record-editor-dialog";
import type { BinEntry } from "@/lib/api/types";

// Mock showModal/close for jsdom and set open attribute
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

// Mock CodeEditor to avoid Monaco dependency
vi.mock("@/components/common/code-editor", () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="code-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe("parseBinValue", () => {
  it("parses integer string to number", () => {
    expect(parseBinValue("42", "integer")).toBe(42);
  });

  it("parses float string to number", () => {
    expect(parseBinValue("3.14", "float")).toBeCloseTo(3.14);
  });

  it("parses 'true' as boolean true", () => {
    expect(parseBinValue("true", "bool")).toBe(true);
  });

  it("parses 'false' as boolean false", () => {
    expect(parseBinValue("false", "bool")).toBe(false);
  });

  it("returns string as-is for string type", () => {
    expect(parseBinValue("hello", "string")).toBe("hello");
  });

  it("parses valid JSON for list type", () => {
    expect(parseBinValue("[1,2,3]", "list")).toEqual([1, 2, 3]);
  });

  it("parses valid JSON for map type", () => {
    expect(parseBinValue('{"key":"value"}', "map")).toEqual({ key: "value" });
  });

  it("returns raw string for invalid JSON in list type", () => {
    expect(parseBinValue("not-json", "list")).toBe("not-json");
  });

  it("returns 0 for invalid integer string", () => {
    expect(parseBinValue("abc", "integer")).toBe(0);
  });
});

describe("detectBinType", () => {
  it("detects integer", () => {
    expect(detectBinType(42)).toBe("integer");
  });

  it("detects float", () => {
    expect(detectBinType(3.14)).toBe("float");
  });

  it("detects string", () => {
    expect(detectBinType("hello")).toBe("string");
  });

  it("detects boolean", () => {
    expect(detectBinType(true)).toBe("bool");
  });

  it("detects list (array)", () => {
    expect(detectBinType([1, 2, 3])).toBe("list");
  });

  it("detects map (plain object)", () => {
    expect(detectBinType({ key: "value" })).toBe("map");
  });

  it("detects geojson (object with type and coordinates)", () => {
    expect(detectBinType({ type: "Point", coordinates: [1, 2] })).toBe("geojson");
  });

  it("returns string for null", () => {
    expect(detectBinType(null)).toBe("string");
  });

  it("returns string for undefined", () => {
    expect(detectBinType(undefined)).toBe("string");
  });
});

describe("RecordEditorDialog", () => {
  const makeBins = (count: number): BinEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `bin-${i}`,
      name: `bin${i}`,
      value: `value${i}`,
      type: "string" as const,
    }));

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    mode: "create" as const,
    namespace: "test",
    set: "demo",
    pk: "",
    onPKChange: vi.fn(),
    ttl: "0",
    onTTLChange: vi.fn(),
    bins: makeBins(1),
    onAddBin: vi.fn(),
    onRemoveBin: vi.fn(),
    onUpdateBin: vi.fn(),
    useCodeEditor: {},
    onToggleCodeEditor: vi.fn(),
    saving: false,
    onSave: vi.fn(),
  };

  it("renders in create mode with correct title", () => {
    render(<RecordEditorDialog {...defaultProps} />);
    expect(screen.getByText("New Record")).toBeInTheDocument();
  });

  it("renders in edit mode with correct title", () => {
    render(<RecordEditorDialog {...defaultProps} mode="edit" />);
    expect(screen.getByText("Edit Record")).toBeInTheDocument();
  });

  it("renders namespace and set in description area", () => {
    const { container } = render(<RecordEditorDialog {...defaultProps} />);
    // The description uses <span> separators, so check the parent text
    const description = container.querySelector("p");
    expect(description?.textContent).toContain("test");
    expect(description?.textContent).toContain("demo");
  });

  it("calls onAddBin when Add button is clicked", async () => {
    const onAddBin = vi.fn();
    const user = userEvent.setup();
    render(<RecordEditorDialog {...defaultProps} onAddBin={onAddBin} />);
    await user.click(screen.getByText("Add"));
    expect(onAddBin).toHaveBeenCalledTimes(1);
  });

  it("shows remove button only when multiple bins exist", () => {
    // Single bin: no trash button
    const { rerender } = render(<RecordEditorDialog {...defaultProps} bins={makeBins(1)} />);
    const singleBinTrashButtons = screen.queryAllByRole("button").filter((btn) =>
      btn.querySelector(".lucide-trash-2"),
    );
    expect(singleBinTrashButtons).toHaveLength(0);

    // Multiple bins: trash buttons appear
    rerender(<RecordEditorDialog {...defaultProps} bins={makeBins(2)} />);
    const multiBinTrashButtons = screen.queryAllByRole("button", { hidden: true }).filter((btn) =>
      btn.querySelector(".lucide-trash-2"),
    );
    expect(multiBinTrashButtons.length).toBeGreaterThan(0);
  });

  it("disables PK input in edit mode", () => {
    render(<RecordEditorDialog {...defaultProps} mode="edit" pk="existing-key" />);
    const pkInput = screen.getByPlaceholderText("Record key");
    expect(pkInput).toBeDisabled();
  });

  it("disables Add button when saving", () => {
    render(<RecordEditorDialog {...defaultProps} saving={true} />);
    expect(screen.getByText("Add")).toBeDisabled();
  });

  it("disables Cancel button when saving", () => {
    render(<RecordEditorDialog {...defaultProps} saving={true} />);
    expect(screen.getByText("Cancel")).toBeDisabled();
  });

  it("shows Update label in edit mode", () => {
    render(<RecordEditorDialog {...defaultProps} mode="edit" />);
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("shows Create label in create mode", () => {
    render(<RecordEditorDialog {...defaultProps} mode="create" />);
    expect(screen.getByText("Create")).toBeInTheDocument();
  });
});

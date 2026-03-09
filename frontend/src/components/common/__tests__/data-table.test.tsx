import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../data-table";

interface TestData {
  id: string;
  name: string;
  status: string;
  region: string;
}

const mockData: TestData[] = [
  { id: "1", name: "Item 1", status: "active", region: "ap-northeast-2" },
  { id: "2", name: "Item 2", status: "inactive", region: "us-west-2" },
  { id: "3", name: "Item 3", status: "active", region: "eu-central-1" },
];

const baseColumns: ColumnDef<TestData>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { mobileSlot: "title" },
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { mobileSlot: "meta" },
  },
  {
    accessorKey: "region",
    header: "Region",
    meta: { hideOn: ["tablet"], mobileSlot: "content" },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => <button aria-label={`Open ${row.original.name}`}>Open</button>,
    meta: { mobileSlot: "actions" },
  },
];

function resizeViewport(width: number, height = 900) {
  (window as Window & { resizeTo: (width: number, height: number) => void }).resizeTo(
    width,
    height,
  );
}

describe("DataTable", () => {
  beforeEach(() => {
    resizeViewport(1280, 900);
  });

  it("renders table with data and columns on desktop", () => {
    render(<DataTable data={mockData} columns={baseColumns} />);
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
  });

  it("shows skeleton loading state when loading=true and data is empty", () => {
    render(<DataTable data={[]} columns={baseColumns} loading={true} />);
    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
  });

  it("shows loading bar when loading=true and data exists", () => {
    render(<DataTable data={mockData} columns={baseColumns} loading={true} />);
    const loadingBar = screen.getByTestId("data-table").querySelector(".loading-bar");
    expect(loadingBar).toBeInTheDocument();
  });

  it("shows empty state when data is empty and not loading", () => {
    render(<DataTable data={[]} columns={baseColumns} loading={false} />);
    expect(screen.getByText("No records")).toBeInTheDocument();
    expect(screen.getByText("No data available to display")).toBeInTheDocument();
  });

  it("renders custom empty state with icon/title/description/action", () => {
    const customEmptyState = (
      <div data-testid="custom-empty">
        <h2>Custom Empty</h2>
        <p>Custom description</p>
        <button>Custom Action</button>
      </div>
    );
    render(
      <DataTable data={[]} columns={baseColumns} loading={false} emptyState={customEmptyState} />,
    );
    expect(screen.getByTestId("custom-empty")).toBeInTheDocument();
  });

  it("applies table class to table element", () => {
    render(<DataTable data={mockData} columns={baseColumns} />);
    const table = screen.getByTestId("data-table").querySelector("table");
    expect(table).toHaveClass("table");
  });

  it("includes data-testid attributes (table, head, body) in table mode", () => {
    render(<DataTable data={mockData} columns={baseColumns} />);
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
    expect(screen.getByTestId("data-table-head")).toBeInTheDocument();
    expect(screen.getByTestId("data-table-body")).toBeInTheDocument();
  });

  it("hides tablet-only columns at tablet widths", async () => {
    resizeViewport(900, 900);
    render(<DataTable data={mockData} columns={baseColumns} />);

    await waitFor(() => {
      expect(screen.queryByText("Region")).not.toBeInTheDocument();
    });
  });

  it("renders default mobile cards when mobileLayout is cards", async () => {
    resizeViewport(390, 844);
    render(<DataTable data={mockData} columns={baseColumns} mobileLayout="cards" />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table-body")).toBeInTheDocument();
    });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Item 1" })).toBeInTheDocument();
  });

  it("uses custom mobile card renderer when provided", async () => {
    resizeViewport(390, 844);
    render(
      <DataTable
        data={mockData}
        columns={baseColumns}
        mobileLayout="cards"
        mobileCardRenderer={(row) => (
          <div data-testid={`custom-card-${row.id}`}>{row.original.name}</div>
        )}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("custom-card-0")).toBeInTheDocument();
    });
  });

  it("row selection toggles work when enableRowSelection=true", async () => {
    const user = userEvent.setup();
    const onRowSelectionChange = vi.fn();
    const selectionColumns: ColumnDef<TestData>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            data-testid="select-all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            data-testid={`select-row-${row.id}`}
          />
        ),
      },
      ...baseColumns,
    ];

    render(
      <DataTable
        data={mockData}
        columns={selectionColumns}
        rowSelection={{}}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    await user.click(screen.getByTestId("select-all"));
    expect(onRowSelectionChange).toHaveBeenCalled();
  });
});

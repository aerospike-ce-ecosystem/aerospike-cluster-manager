import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TablePagination } from "../table-pagination";

describe("TablePagination", () => {
  it("renders page numbers correctly", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <TablePagination
        total={100}
        page={1}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <TablePagination
        total={100}
        page={1}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const prevButtons = screen.getAllByRole("button").filter((btn) => {
      const svg = btn.querySelector("svg");
      return svg && btn.className.includes("page-num-btn");
    });
    const leftChevron = prevButtons[1]; // ChevronLeft is second button
    expect(leftChevron).toBeDisabled();
  });

  it("disables next button on last page", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const totalPages = 4;
    render(
      <TablePagination
        total={100}
        page={totalPages}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const buttons = screen
      .getAllByRole("button")
      .filter((btn) => btn.className.includes("page-num-btn"));
    const nextButton = buttons[buttons.length - 2]; // ChevronRight is second to last
    expect(nextButton).toBeDisabled();
  });

  it("calls onPageChange with correct page number", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <TablePagination
        total={100}
        page={1}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const pageButton = screen.getByText("2");
    await user.click(pageButton);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("shows ellipsis for large page counts", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <TablePagination
        total={1000}
        page={5}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    const ellipsis = screen.getAllByText("···");
    expect(ellipsis.length).toBeGreaterThan(0);
  });

  it("page size selector calls onPageSizeChange", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <TablePagination
        total={100}
        page={1}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[25, 50, 100]}
      />,
    );
    const selectTrigger = screen.getByRole("combobox");
    await user.click(selectTrigger);
    const option50 = screen.getByRole("option", { name: "50" });
    await user.click(option50);
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("adds safe-bottom styling for compact mobile layouts", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const { container } = render(
      <TablePagination
        total={100}
        page={2}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("safe-bottom");
  });
});

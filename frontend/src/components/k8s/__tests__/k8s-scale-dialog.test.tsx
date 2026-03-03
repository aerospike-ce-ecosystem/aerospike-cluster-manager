import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { K8sScaleDialog } from "../k8s-scale-dialog";

// Mock showModal/close for jsdom and set open attribute
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("K8sScaleDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    clusterName: "test-cluster",
    currentSize: 3,
    onScale: vi.fn().mockResolvedValue(undefined),
  };

  it("renders dialog title and description", () => {
    render(<K8sScaleDialog {...defaultProps} />);
    expect(screen.getByText("Scale Cluster")).toBeInTheDocument();
    expect(screen.getByText(/test-cluster/)).toBeInTheDocument();
    expect(screen.getByText(/Current size: 3/)).toBeInTheDocument();
  });

  it("renders input with current size as default value", () => {
    render(<K8sScaleDialog {...defaultProps} />);
    const input = screen.getByLabelText(/Cluster Size/i);
    expect(input).toHaveValue(3);
  });

  it("disables Scale button when size equals currentSize", () => {
    render(<K8sScaleDialog {...defaultProps} />);
    const scaleBtn = screen.getByRole("button", { name: "Scale" });
    expect(scaleBtn).toBeDisabled();
  });

  it("enables Scale button when size differs from currentSize", () => {
    render(<K8sScaleDialog {...defaultProps} />);
    const input = screen.getByLabelText(/Cluster Size/i);
    fireEvent.change(input, { target: { value: "5" } });
    const scaleBtn = screen.getByRole("button", { name: "Scale" });
    expect(scaleBtn).not.toBeDisabled();
  });

  it("calls onScale with the new size", async () => {
    const onScale = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<K8sScaleDialog {...defaultProps} onScale={onScale} />);
    const input = screen.getByLabelText(/Cluster Size/i);
    fireEvent.change(input, { target: { value: "5" } });
    const scaleBtn = screen.getByRole("button", { name: "Scale" });
    await user.click(scaleBtn);
    expect(onScale).toHaveBeenCalledWith(5);
  });

  it("shows scale-down warning when new size is less than current", () => {
    render(<K8sScaleDialog {...defaultProps} />);
    const input = screen.getByLabelText(/Cluster Size/i);
    fireEvent.change(input, { target: { value: "1" } });
    expect(screen.getByText(/Scaling down/)).toBeInTheDocument();
  });

  it("disables Cancel button during loading", async () => {
    const onScale = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<K8sScaleDialog {...defaultProps} onScale={onScale} />);
    const input = screen.getByLabelText(/Cluster Size/i);
    fireEvent.change(input, { target: { value: "5" } });
    const scaleBtn = screen.getByRole("button", { name: "Scale" });
    await user.click(scaleBtn);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

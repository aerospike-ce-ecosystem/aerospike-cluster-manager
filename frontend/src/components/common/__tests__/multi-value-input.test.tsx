import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MultiValueInput } from "../multi-value-input";

describe("MultiValueInput", () => {
  it("renders add button with default label", () => {
    render(<MultiValueInput value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders custom add label", () => {
    render(<MultiValueInput value={undefined} onChange={() => {}} addLabel="Add CIDR" />);
    expect(screen.getByRole("button", { name: /add cidr/i })).toBeInTheDocument();
  });

  it("renders existing items as chips", () => {
    render(<MultiValueInput value={["10.0.0.0/8", "192.168.0.0/16"]} onChange={() => {}} />);
    expect(screen.getByText("10.0.0.0/8")).toBeInTheDocument();
    expect(screen.getByText("192.168.0.0/16")).toBeInTheDocument();
  });

  it("adds a new item when clicking add button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiValueInput value={["existing"]} onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "new-item");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(onChange).toHaveBeenCalledWith(["existing", "new-item"]);
  });

  it("does not add duplicate items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiValueInput value={["dup"]} onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "dup");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows error when validation fails", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const validate = () => false;
    render(<MultiValueInput value={undefined} onChange={onChange} validate={validate} />);

    await user.type(screen.getByRole("textbox"), "invalid");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(screen.getByText("Invalid format")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears error when input changes", async () => {
    const user = userEvent.setup();
    const validate = () => false;
    render(<MultiValueInput value={undefined} onChange={() => {}} validate={validate} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "bad");
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByText("Invalid format")).toBeInTheDocument();

    await user.type(input, "x");
    expect(screen.queryByText("Invalid format")).not.toBeInTheDocument();
  });

  it("removes an item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiValueInput value={["a", "b"]} onChange={onChange} />);

    // Click the remove button on the first chip
    const removeButtons = screen.getAllByRole("button").filter((btn) => {
      return btn.querySelector("svg") && !btn.textContent?.includes("Add");
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith(["b"]);
  });

  it("calls onChange with undefined when last item is removed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiValueInput value={["only"]} onChange={onChange} />);

    const removeButtons = screen.getAllByRole("button").filter((btn) => {
      return btn.querySelector("svg") && !btn.textContent?.includes("Add");
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("disables input and button when disabled prop is true", () => {
    render(<MultiValueInput value={undefined} onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });
});

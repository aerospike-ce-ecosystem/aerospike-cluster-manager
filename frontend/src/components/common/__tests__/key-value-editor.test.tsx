import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyValueEditor } from "../key-value-editor";

describe("KeyValueEditor", () => {
  it("renders add button with default label", () => {
    render(<KeyValueEditor value={undefined} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /add entry/i })).toBeInTheDocument();
  });

  it("renders custom add label", () => {
    render(<KeyValueEditor value={undefined} onChange={() => {}} addLabel="Add label" />);
    expect(screen.getByRole("button", { name: /add label/i })).toBeInTheDocument();
  });

  it("renders existing entries", () => {
    render(<KeyValueEditor value={{ host: "localhost", port: "3000" }} onChange={() => {}} />);
    expect(screen.getByText("host")).toBeInTheDocument();
    expect(screen.getByText("localhost")).toBeInTheDocument();
    expect(screen.getByText("port")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
  });

  it("adds a new entry when clicking add button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyValueEditor value={undefined} onChange={onChange} />);

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "myKey");
    await user.type(inputs[1], "myVal");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    expect(onChange).toHaveBeenCalledWith({ myKey: "myVal" });
  });

  it("does not add entry when key is empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyValueEditor value={undefined} onChange={onChange} />);

    const addBtn = screen.getByRole("button", { name: /add entry/i });
    expect(addBtn).toBeDisabled();

    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "val");
    await user.click(addBtn);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes an entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyValueEditor value={{ a: "1", b: "2" }} onChange={onChange} />);

    // Click the first remove button (for entry "a")
    const removeButtons = screen.getAllByRole("button").filter((btn) => {
      return btn.querySelector("svg") && btn.textContent === "";
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith({ b: "2" });
  });

  it("calls onChange with undefined when last entry is removed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyValueEditor value={{ only: "one" }} onChange={onChange} />);

    const removeButtons = screen.getAllByRole("button").filter((btn) => {
      return btn.querySelector("svg") && btn.textContent === "";
    });
    await user.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("disables inputs and buttons when disabled prop is true", () => {
    render(<KeyValueEditor value={undefined} onChange={() => {}} disabled />);
    const inputs = screen.getAllByRole("textbox");
    inputs.forEach((input) => expect(input).toBeDisabled());
    expect(screen.getByRole("button", { name: /add entry/i })).toBeDisabled();
  });
});

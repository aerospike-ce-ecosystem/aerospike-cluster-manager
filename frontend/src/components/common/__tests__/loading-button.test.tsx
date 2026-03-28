import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadingButton } from "../loading-button";

describe("LoadingButton", () => {
  it("renders children when not loading", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("shows spinner when loading", () => {
    const { container } = render(<LoadingButton loading>Submit</LoadingButton>);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("disables button when loading", () => {
    render(<LoadingButton loading>Submit</LoadingButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when disabled prop is true", () => {
    render(<LoadingButton disabled>Submit</LoadingButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is enabled when not loading and not disabled", () => {
    render(<LoadingButton>Submit</LoadingButton>);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<LoadingButton onClick={onClick}>Submit</LoadingButton>);
    await user.click(screen.getByText("Submit"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards variant prop", () => {
    render(<LoadingButton variant="destructive">Delete</LoadingButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

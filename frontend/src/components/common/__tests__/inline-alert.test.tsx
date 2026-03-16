import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineAlert } from "../inline-alert";

describe("InlineAlert", () => {
  it("renders nothing when message is null", () => {
    const { container } = render(<InlineAlert message={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when message is undefined", () => {
    const { container } = render(<InlineAlert message={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when message is empty string", () => {
    const { container } = render(<InlineAlert message="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders error message", () => {
    render(<InlineAlert message="Something went wrong" />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("applies error variant by default", () => {
    render(<InlineAlert message="Error" />);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("alert-error");
  });

  it("applies warning variant", () => {
    render(<InlineAlert message="Warning" variant="warning" />);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("alert-warning");
  });

  it("applies info variant", () => {
    render(<InlineAlert message="Info" variant="info" />);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("alert-info");
  });

  it("applies custom className", () => {
    render(<InlineAlert message="Test" className="mt-4" />);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("mt-4");
  });

  it("has aria-live attribute", () => {
    render(<InlineAlert message="Test" />);
    const el = screen.getByRole("alert");
    expect(el).toHaveAttribute("aria-live", "polite");
  });

  it("uses DaisyUI alert base class", () => {
    render(<InlineAlert message="Test" />);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("alert");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "../collapsible-section";

describe("CollapsibleSection", () => {
  it("renders the title", () => {
    render(
      <CollapsibleSection title="My Section">
        <p>Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("renders the summary when provided", () => {
    render(
      <CollapsibleSection title="Section" summary="Some detail">
        <p>Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Some detail")).toBeInTheDocument();
  });

  it("does not render children when collapsed (default)", () => {
    render(
      <CollapsibleSection title="Section">
        <p>Hidden content</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("renders children when defaultOpen is true", () => {
    render(
      <CollapsibleSection title="Section" defaultOpen>
        <p>Visible content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });

  it("toggles children on click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Toggle Section">
        <p>Toggled content</p>
      </CollapsibleSection>,
    );

    expect(screen.queryByText("Toggled content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Toggled content")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.queryByText("Toggled content")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <CollapsibleSection title="Section" className="mt-8">
        <p>Content</p>
      </CollapsibleSection>,
    );
    expect(container.firstChild).toHaveClass("mt-8");
  });

  it("renders smaller text for sm size", () => {
    render(
      <CollapsibleSection title="Small" size="sm" defaultOpen>
        <p>Content</p>
      </CollapsibleSection>,
    );
    const titleEl = screen.getByText("Small");
    expect(titleEl.className).toContain("text-xs");
  });

  it("renders default size text without sm class", () => {
    render(
      <CollapsibleSection title="Default" defaultOpen>
        <p>Content</p>
      </CollapsibleSection>,
    );
    const titleEl = screen.getByText("Default");
    expect(titleEl.className).toContain("text-sm");
  });
});

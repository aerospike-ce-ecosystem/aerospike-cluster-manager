"use client";

import * as React from "react";

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    if (props.children) return extractText(props.children as React.ReactNode);
  }
  return "";
}

interface TooltipTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

const TooltipTrigger: React.FC<TooltipTriggerProps> = ({ children }) => <>{children}</>;
TooltipTrigger.displayName = "TooltipTrigger";

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
}

const TooltipContent: React.FC<TooltipContentProps> = () => null;
TooltipContent.displayName = "TooltipContent";

const Tooltip = ({ children }: { children: React.ReactNode }) => {
  let triggerContent: React.ReactNode = null;
  let tipText = "";
  let asChild = false;

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type === TooltipTrigger) {
      const p = child.props as TooltipTriggerProps;
      triggerContent = p.children;
      asChild = p.asChild ?? false;
    } else if (child.type === TooltipContent) {
      const p = child.props as TooltipContentProps & { children?: React.ReactNode };
      tipText = extractText(p.children);
    }
  });

  // When asChild is true, clone the child element to add the title attribute directly
  if (asChild && React.isValidElement(triggerContent)) {
    return React.cloneElement(
      triggerContent as React.ReactElement<{ title?: string }>,
      { title: tipText },
    );
  }

  return (
    <span className="inline-flex" title={tipText}>
      {triggerContent}
    </span>
  );
};

export { Tooltip, TooltipTrigger, TooltipContent };

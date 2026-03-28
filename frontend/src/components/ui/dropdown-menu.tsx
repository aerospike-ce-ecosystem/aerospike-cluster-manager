"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  portalRef: React.RefObject<HTMLDivElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
  portalRef: { current: null },
});

const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLElement>(null);
  const portalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        (!portalRef.current || !portalRef.current.contains(target))
      ) {
        setOpen(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const handleScroll = () => setOpen(false);

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    window.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, portalRef }}>
      <div
        ref={ref}
        className="relative inline-block"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
      >
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
};

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ asChild, children, className, ...props }, ref) => {
    const { open, setOpen, triggerRef } = React.useContext(DropdownMenuContext);

    const setRefs = React.useCallback(
      (node: HTMLElement | null) => {
        triggerRef.current = node;
        if (typeof ref === "function") ref(node as HTMLButtonElement | null);
        else if (ref) ref.current = node as HTMLButtonElement | null;
      },
      [ref, triggerRef],
    );

    if (asChild && React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>;
      // eslint-disable-next-line react-hooks/refs -- callback ref is invoked by React during commit phase, not during render
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ref: setRefs,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (typeof childProps.onClick === "function") childProps.onClick(e);
          setOpen(!open);
        },
      });
    }

    return (
      <button
        ref={setRefs}
        className={cn(className)}
        {...props}
        onClick={(e) => {
          e.stopPropagation();
          if (typeof props.onClick === "function") props.onClick(e);
          setOpen(!open);
        }}
      >
        {children}
      </button>
    );
  },
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end" | "center";
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = "start", sideOffset = 4, children, ...props }, ref) => {
    const { open, triggerRef, portalRef } = React.useContext(DropdownMenuContext);
    const [position, setPosition] = React.useState<React.CSSProperties | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        portalRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref, portalRef],
    );

    React.useLayoutEffect(() => {
      if (!open) {
        setPosition(null);
        return;
      }

      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const style: React.CSSProperties = {
        position: "fixed",
        top: rect.bottom + sideOffset,
        zIndex: 9999,
      };

      if (align === "end") {
        style.right = window.innerWidth - rect.right;
      } else {
        style.left = rect.left;
      }

      setPosition(style);
    }, [open, align, sideOffset, triggerRef]);

    if (!open || !position) return null;

    return createPortal(
      <div
        ref={setRefs}
        role="menu"
        className={cn(
          "border-base-300 bg-base-100 text-base-content min-w-[8rem] overflow-hidden rounded-xl border p-2 shadow-lg",
          className,
        )}
        style={position}
        {...props}
        onClick={(e) => {
          e.stopPropagation();
          if (props.onClick) props.onClick(e);
        }}
      >
        {children}
      </div>,
      document.body,
    );
  },
);
DropdownMenuContent.displayName = "DropdownMenuContent";

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
  disabled?: boolean;
}

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, inset, disabled, onClick, children, ...props }, ref) => {
    const { setOpen } = React.useContext(DropdownMenuContext);

    return (
      <div
        ref={ref}
        role="menuitem"
        className={cn(
          "hover:bg-base-200 relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none select-none",
          inset && "pl-8",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onClick?.(e);
          setOpen(false);
        }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuCheckboxItem = DropdownMenuItem;

const DropdownMenuRadioItem = DropdownMenuItem;

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("bg-base-300 -mx-1 my-1 h-px", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

const DropdownMenuGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuSub = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const DropdownMenuSubContent = DropdownMenuContent;
const DropdownMenuSubTrigger = DropdownMenuTrigger;
const DropdownMenuRadioGroup = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};

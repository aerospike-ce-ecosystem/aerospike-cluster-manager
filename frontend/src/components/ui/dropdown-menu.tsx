"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
});

const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div
        ref={ref}
        className="dropdown relative inline-block"
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
    const { open, setOpen } = React.useContext(DropdownMenuContext);

    if (asChild && React.isValidElement(children)) {
      const childProps = children.props as Record<string, unknown>;
      return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          if (typeof childProps.onClick === "function") childProps.onClick(e);
          setOpen(!open);
        },
      });
    }

    return (
      <button
        ref={ref}
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
  ({ className, align = "start", children, ...props }, ref) => {
    const { open } = React.useContext(DropdownMenuContext);
    if (!open) return null;

    return (
      <div
        ref={ref}
        role="menu"
        className={cn(
          "dropdown-content menu border-base-300 bg-base-100 text-base-content rounded-box absolute z-50 mt-1 min-w-[8rem] overflow-hidden border p-2 shadow-lg",
          align === "end" ? "right-0" : "left-0",
          className,
        )}
        {...props}
        onClick={(e) => {
          e.stopPropagation();
          if (props.onClick) props.onClick(e);
        }}
      >
        {children}
      </div>
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

"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetContextValue {
  onClose: () => void;
}

const SheetContext = React.createContext<SheetContextValue>({
  onClose: () => {},
});

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preventClose?: boolean;
  children: React.ReactNode;
}

export function Sheet({ open, onOpenChange, preventClose, children }: SheetProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = React.useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 flex h-full w-full items-end justify-center bg-black/50 p-0 backdrop-blur-sm open:flex [&:not([open])]:hidden"
      onCancel={(e) => {
        e.preventDefault();
        if (!preventClose) handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !preventClose) handleClose();
      }}
    >
      <SheetContext.Provider value={{ onClose: handleClose }}>{children}</SheetContext.Provider>
    </dialog>
  );
}

export const SheetTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const SheetPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const SheetOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />,
);
SheetOverlay.displayName = "SheetOverlay";

export const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const { onClose } = React.useContext(SheetContext);
  return (
    <button
      ref={ref}
      onClick={(e) => {
        onClick?.(e);
        onClose();
      }}
      {...props}
    />
  );
});
SheetClose.displayName = "SheetClose";

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "bottom";
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = "bottom", children, ...props }, ref) => {
    const { onClose } = React.useContext(SheetContext);
    return (
      <div
        ref={ref}
        className={cn(
          "sheet-content bg-base-200 text-base-content relative w-full max-w-none border-t shadow-2xl",
          side === "bottom" &&
            "animate-sheet-up rounded-t-3xl px-0 pt-5 pb-0 sm:mx-auto sm:mb-6 sm:max-w-[640px] sm:rounded-3xl sm:border",
          className,
        )}
        {...props}
      >
        <div
          className="bg-base-300 mx-auto mb-3 h-1.5 w-12 rounded-full sm:hidden"
          aria-hidden="true"
        />
        {children}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-base-300 hover:text-base-content transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  },
);
SheetContent.displayName = "SheetContent";

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 px-5 pb-3 text-left", className)} {...props} />
  );
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 px-5 py-4", className)} {...props} />;
}

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg leading-none font-semibold tracking-tight", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-base-content/60 text-sm", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";

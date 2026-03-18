"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DialogContextValue {
  onClose: () => void;
  preventClose?: boolean;
}

const DialogContext = React.createContext<DialogContextValue>({
  onClose: () => {},
});

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preventClose?: boolean;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, preventClose, children }) => {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  const handleClose = React.useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!preventClose) handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !preventClose) handleClose();
      }}
    >
      <DialogContext.Provider value={{ onClose: handleClose, preventClose }}>
        {children}
      </DialogContext.Provider>
    </dialog>
  );
};

const DialogTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
DialogTrigger.displayName = "DialogTrigger";

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;
DialogPortal.displayName = "DialogPortal";

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} {...props} />,
);
DialogOverlay.displayName = "DialogOverlay";

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const { onClose, preventClose } = React.useContext(DialogContext);
  return (
    <button
      ref={ref}
      disabled={preventClose}
      onClick={(e) => {
        onClick?.(e);
        onClose();
      }}
      {...props}
    />
  );
});
DialogClose.displayName = "DialogClose";

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { onClose, preventClose } = React.useContext(DialogContext);
    return (
      <div
        ref={ref}
        className={cn("modal-box relative max-w-[calc(100vw-2rem)] sm:max-w-lg", className)}
        {...props}
      >
        {children}
        <button
          onClick={onClose}
          disabled={preventClose}
          className="btn btn-sm btn-circle btn-ghost absolute top-4 right-4 h-10 w-10 sm:h-8 sm:w-8"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  },
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-lg leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-base-content/60 text-sm", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

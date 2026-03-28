import * as React from "react";

import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Native <select> wrapper (original)                                 */
/* ------------------------------------------------------------------ */

const SelectNative = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "border-base-300 bg-base-100 focus-visible:ring-primary/50 flex h-10 w-full appearance-none rounded-lg border px-3 py-2 text-base shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
SelectNative.displayName = "SelectNative";

/* ------------------------------------------------------------------ */
/*  Radix-like Select API (using native <select> under the hood)       */
/* ------------------------------------------------------------------ */

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Native onChange still supported for backwards compat */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  children?: React.ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
}

interface SelectContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const SelectContext = React.createContext<SelectContextValue>({});

function Select({
  value,
  defaultValue,
  onValueChange,
  onChange,
  children,
  id,
  className,
  disabled,
}: SelectProps) {
  const ctx = React.useMemo(
    () => ({ value, onValueChange, onChange, id, className, disabled }),
    [value, onValueChange, onChange, id, className, disabled],
  );

  // If used as native select (children are <option> elements), render directly
  const hasRadixChildren = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      ((child.type as { displayName?: string })?.displayName === "SelectTrigger" ||
        (child.type as { displayName?: string })?.displayName === "SelectContent"),
  );

  if (!hasRadixChildren) {
    // Native mode: render as plain <select>
    return (
      <SelectNative
        id={id}
        className={className}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
      >
        {children}
      </SelectNative>
    );
  }

  return <SelectContext.Provider value={ctx}>{children}</SelectContext.Provider>;
}

/* ---- Sub-components ---- */

function SelectTrigger({
  children,
  id: triggerId,
  className: triggerClassName,
}: {
  children?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  // Rendered by the parent Select's native <select> — this is a no-op wrapper
  // that collects props for the eventual <select> render in SelectContent.
  const ctx = React.useContext(SelectContext);
  void ctx;
  void children;
  void triggerId;
  void triggerClassName;
  return null; // SelectContent handles the actual rendering
}
SelectTrigger.displayName = "SelectTrigger";

function SelectValue({ placeholder }: { placeholder?: string }) {
  void placeholder;
  return null; // placeholder handled by native select
}
SelectValue.displayName = "SelectValue";

function SelectContent({ children }: { children?: React.ReactNode }) {
  const ctx = React.useContext(SelectContext);

  return (
    <SelectNative
      id={ctx.id}
      className={ctx.className}
      value={ctx.value}
      disabled={ctx.disabled}
      onChange={(e) => {
        ctx.onChange?.(e);
        ctx.onValueChange?.(e.target.value);
      }}
    >
      {children}
    </SelectNative>
  );
}
SelectContent.displayName = "SelectContent";

function SelectItem({
  value,
  children,
  disabled,
}: {
  value: string;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  );
}
SelectItem.displayName = "SelectItem";

export { Select, SelectNative, SelectTrigger, SelectValue, SelectContent, SelectItem };

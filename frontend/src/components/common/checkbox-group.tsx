import { Checkbox } from "@/components/ui/checkbox";

interface CheckboxItem {
  id: string;
  label: string;
}

interface CheckboxGroupProps {
  items: CheckboxItem[];
  selected: string[];
  onToggle: (id: string) => void;
  /** CSS max-height for the scrollable container (default: "200px") */
  maxHeight?: string;
  idPrefix?: string;
}

/**
 * A scrollable, bordered list of checkboxes.
 * Replaces repeated patterns in WizardAclStep, CreateUserDialog, etc.
 */
export function CheckboxGroup({
  items,
  selected,
  onToggle,
  maxHeight = "200px",
  idPrefix = "cb",
}: CheckboxGroupProps) {
  return (
    <div className="space-y-2 overflow-auto rounded-md border p-3" style={{ maxHeight }}>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${item.id}`}
            checked={selected.includes(item.id)}
            onCheckedChange={() => onToggle(item.id)}
          />
          <label htmlFor={`${idPrefix}-${item.id}`} className="cursor-pointer text-sm">
            {item.label}
          </label>
        </div>
      ))}
    </div>
  );
}

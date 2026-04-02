import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { K8sNodeInfo } from "@/lib/api/types";

interface EditNodeBlocklistSectionProps {
  /** Comma-separated node names */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Pre-fetched K8s node list (fetched once by parent dialog) */
  nodes?: K8sNodeInfo[];
  /** Whether the node list is still loading */
  nodesLoading?: boolean;
}

export function EditNodeBlocklistSection({
  value,
  onChange,
  disabled,
  nodes = [],
  nodesLoading = false,
}: EditNodeBlocklistSectionProps) {
  const blocked = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const toggleNode = (name: string) => {
    const next = new Set(blocked);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onChange(Array.from(next).join(", "));
  };

  if (nodesLoading) {
    return (
      <div className="space-y-2">
        <Label className="text-xs">Node Block List</Label>
        <p className="text-base-content/60 text-xs">Loading nodes...</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="grid gap-1">
        <Label htmlFor="edit-node-blocklist" className="text-xs">
          Node Block List
        </Label>
        <Input
          id="edit-node-blocklist"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="node1, node2"
          disabled={disabled}
        />
        <p className="text-base-content/60 text-[10px]">
          Comma-separated K8s node names to exclude from scheduling
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold">
        Node Block List{" "}
        {blocked.size > 0 && (
          <span className="text-warning font-normal">({blocked.size} blocked)</span>
        )}
      </Label>
      <p className="text-base-content/60 text-[10px]">
        Select nodes to exclude from Aerospike pod scheduling.
      </p>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
        {nodes.map((node) => (
          <label
            key={node.name}
            className="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs"
          >
            <Checkbox
              checked={blocked.has(node.name)}
              onCheckedChange={() => toggleNode(node.name)}
              disabled={disabled}
            />
            <span className="flex-1 font-mono">{node.name}</span>
            {node.zone && <span className="text-base-content/65">{node.zone}</span>}
            <span
              className={`inline-block h-2 w-2 rounded-full ${node.ready ? "bg-success" : "bg-error"}`}
              title={node.ready ? "Ready" : "Not Ready"}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

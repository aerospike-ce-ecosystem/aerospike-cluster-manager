"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import type { UnifiedClusterRow } from "@/lib/api/types";
import { formatNumber } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { AckoBadge } from "@/components/cluster-list/acko-badge";
import { LabelEditorPopover } from "@/components/cluster-list/label-editor-popover";

interface ClusterListColumnOptions {
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
  onLabelChange: (id: string, label?: string, color?: string) => void;
}

export function getClusterListColumns(
  opts: ClusterListColumnOptions,
): ColumnDef<UnifiedClusterRow>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: "Cluster Name",
      size: 280,
      enableSorting: true,
      meta: { mobileSlot: "title" as const, cellClassName: "!overflow-visible" },
      cell: ({ row }) => {
        const { name, isAckoManaged } = row.original;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{name}</span>
              {isAckoManaged && <AckoBadge />}
            </div>
          </div>
        );
      },
    },
    {
      id: "label",
      accessorKey: "label",
      header: "Label",
      size: 140,
      enableSorting: false,
      meta: { hideOn: ["mobile"] },
      cell: ({ row }) => {
        const { id, label, labelColor } = row.original;
        if (label) {
          return (
            <LabelEditorPopover
              currentLabel={label}
              currentColor={labelColor}
              onSave={(newLabel, newColor) => opts.onLabelChange(id, newLabel, newColor)}
            >
              <button className="cursor-pointer">
                <Badge
                  className="text-[11px]"
                  style={{
                    backgroundColor: labelColor || "#6B7280",
                    color: "#fff",
                    borderColor: "transparent",
                  }}
                >
                  {label}
                </Badge>
              </button>
            </LabelEditorPopover>
          );
        }
        return (
          <LabelEditorPopover
            onSave={(newLabel, newColor) => opts.onLabelChange(id, newLabel, newColor)}
          >
            <button className="text-muted-foreground/50 hover:text-muted-foreground hover:bg-base-200 flex h-6 w-6 items-center justify-center rounded-md transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </LabelEditorPopover>
        );
      },
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      size: 200,
      enableSorting: false,
      meta: { hideOn: ["mobile"] },
      cell: ({ row }) => {
        const { description } = row.original;
        return (
          <span className="text-muted-foreground truncate text-sm">{description || "--"}</span>
        );
      },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      size: 130,
      enableSorting: true,
      meta: { mobileSlot: "meta" as const },
      cell: ({ row }) => {
        const { status } = row.original;
        const statusMap: Record<string, "connected" | "disconnected" | "checking"> = {
          connected: "connected",
          disconnected: "disconnected",
          checking: "checking",
          unknown: "checking",
        };
        return <StatusBadge status={statusMap[status] || "checking"} />;
      },
    },
    {
      id: "nodeCount",
      accessorKey: "nodeCount",
      header: "Nodes",
      size: 80,
      enableSorting: true,
      meta: { hideOn: ["mobile", "tablet"] },
      cell: ({ row }) => {
        const { nodeCount } = row.original;
        return (
          <span className={nodeCount === 0 ? "text-muted-foreground" : ""}>
            {nodeCount === 0 ? "--" : nodeCount}
          </span>
        );
      },
    },
    {
      id: "hosts",
      accessorKey: "hosts",
      header: "Host",
      size: 180,
      enableSorting: false,
      meta: { hideOn: ["mobile"] },
      cell: ({ row }) => {
        const { hosts } = row.original;
        return <span className="truncate font-mono text-xs">{hosts || "--"}</span>;
      },
    },
    {
      id: "totalOps",
      accessorKey: "totalOps",
      header: "Total Ops",
      size: 100,
      enableSorting: true,
      meta: { hideOn: ["mobile"] },
      cell: ({ row }) => {
        const { totalOps } = row.original;
        return (
          <span className={totalOps === undefined ? "text-muted-foreground" : ""}>
            {totalOps !== undefined ? formatNumber(totalOps) : "--"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      size: 60,
      enableSorting: false,
      meta: { mobileSlot: "actions" as const, cellClassName: "!overflow-visible" },
      cell: ({ row }) => {
        const { id, source } = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="hover:bg-base-200 flex h-8 w-8 items-center justify-center rounded-md transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {source !== "k8s" && (
                <>
                  <DropdownMenuItem onClick={() => opts.onEdit(id)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-error"
                    onClick={() => opts.onDelete(row.original)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {source === "k8s" && (
                <DropdownMenuItem>
                  <ExternalLink className="h-4 w-4" />
                  View Details
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

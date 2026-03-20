"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, ExternalLink } from "lucide-react";
import type { UnifiedClusterRow } from "@/lib/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/common/status-badge";
import { AckoBadge } from "@/components/cluster-list/acko-badge";

interface ClusterListColumnOptions {
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
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
      meta: { mobileSlot: "title" as const },
      cell: ({ row }) => {
        const { name, isAckoManaged, color } = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{name}</span>
                {isAckoManaged && <AckoBadge />}
              </div>
            </div>
          </div>
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
      id: "actions",
      header: "",
      size: 60,
      enableSorting: false,
      meta: { mobileSlot: "actions" as const },
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

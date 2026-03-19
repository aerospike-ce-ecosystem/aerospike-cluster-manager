"use client";

import * as React from "react";
import { SortingState } from "@tanstack/react-table";
import { Server } from "lucide-react";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import type { UnifiedClusterRow } from "@/lib/api/types";
import { getClusterListColumns } from "@/components/cluster-list/cluster-list-columns";

interface ClusterListTableProps {
  rows: UnifiedClusterRow[];
  loading: boolean;
  onRowClick: (row: UnifiedClusterRow) => void;
  onEdit: (id: string) => void;
  onDelete: (row: UnifiedClusterRow) => void;
  onLabelChange: (id: string, label?: string, color?: string) => void;
}

export function ClusterListTable({
  rows,
  loading,
  onRowClick,
  onEdit,
  onDelete,
  onLabelChange,
}: ClusterListTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => getClusterListColumns({ onEdit, onDelete, onLabelChange }),
    [onEdit, onDelete, onLabelChange],
  );

  const sortedRows = React.useMemo(() => {
    if (sorting.length === 0) return rows;

    const [sort] = sorting;
    const { id, desc } = sort;

    return [...rows].sort((a, b) => {
      const aVal = a[id as keyof UnifiedClusterRow];
      const bVal = b[id as keyof UnifiedClusterRow];

      if (aVal === undefined || aVal === null) return desc ? -1 : 1;
      if (bVal === undefined || bVal === null) return desc ? 1 : -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return desc ? bVal - aVal : aVal - bVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return desc ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr);
    });
  }, [rows, sorting]);

  return (
    <DataTable
      data={sortedRows}
      columns={columns}
      loading={loading}
      density="comfortable"
      sorting={sorting}
      onSortingChange={setSorting}
      getRowId={(row) => row.id}
      onRowClick={(row) => onRowClick(row.original)}
      mobileLayout="cards"
      emptyState={
        <EmptyState
          icon={Server}
          title="No clusters"
          description="Add a connection or deploy a K8s cluster to get started."
        />
      }
    />
  );
}

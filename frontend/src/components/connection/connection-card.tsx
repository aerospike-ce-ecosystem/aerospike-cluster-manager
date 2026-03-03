"use client";

import { Server, Pencil, Trash2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/status-badge";
import type { ConnectionProfile, ConnectionStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface ConnectionCardProps {
  conn: ConnectionProfile;
  status?: ConnectionStatus;
  isCheckingHealth?: boolean;
  index: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ConnectionCard({
  conn,
  status,
  isCheckingHealth,
  index,
  onClick,
  onEdit,
  onDelete,
}: ConnectionCardProps) {
  const badgeStatus =
    isCheckingHealth && !status ? "checking" : status?.connected ? "connected" : "disconnected";

  return (
    <Card
      className={cn(
        "group card-interactive animate-fade-in-up cursor-pointer",
        "hover:border-accent/30",
      )}
      style={{ animationDelay: `${index * 0.05}s`, animationFillMode: "backwards" }}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-3 w-3 shrink-0 rounded-full shadow-sm"
              style={{
                backgroundColor: conn.color,
                boxShadow: `0 0 0 2px var(--color-card), 0 0 0 4px ${conn.color}30`,
              }}
            />
            <CardTitle className="text-base">{conn.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="sr-only">Actions</span>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z"
                    fill="currentColor"
                  />
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardDescription className="font-mono text-xs tracking-wide">
          {conn.hosts.join(", ")}:{conn.port}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={badgeStatus} />
          {status?.connected && (
            <>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Server className="h-3 w-3" />
                {status.nodeCount} node
                {status.nodeCount !== 1 ? "s" : ""}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Database className="h-3 w-3" />
                {status.namespaceCount} ns
              </Badge>
            </>
          )}
        </div>
        {status?.connected && status.build && (
          <p className="text-muted-foreground mt-2.5 font-mono text-xs">
            {status.edition} {status.build}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CSSProperties } from "react";
import type { RowData } from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
    style?: CSSProperties;
    headerClassName?: string;
    cellClassName?: string;
    hideOn?: Array<"mobile" | "tablet">;
    mobileLabel?: string;
    mobileSlot?: "title" | "meta" | "content" | "actions";
  }
}

export {};

"use client";

import { use } from "react";
import { RecordDetailPage } from "@/components/browser/record-detail-page";

export default function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ connId: string; ns: string; set: string }>;
  searchParams: Promise<{ pk?: string; intent?: string; returnTo?: string }>;
}) {
  const { connId, ns, set } = use(params);
  const { pk, intent, returnTo } = use(searchParams);

  return (
    <RecordDetailPage
      connId={connId}
      namespace={decodeURIComponent(ns)}
      setName={decodeURIComponent(set)}
      pk={pk}
      initialIntent={intent === "edit" ? "edit" : undefined}
      returnTo={returnTo}
    />
  );
}

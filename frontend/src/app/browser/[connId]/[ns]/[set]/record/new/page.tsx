"use client";

import { use } from "react";
import { RecordDetailPage } from "@/components/browser/record-detail-page";

export default function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ connId: string; ns: string; set: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { connId, ns, set } = use(params);
  const { returnTo } = use(searchParams);

  return (
    <RecordDetailPage
      connId={connId}
      namespace={decodeURIComponent(ns)}
      setName={decodeURIComponent(set)}
      returnTo={returnTo}
      createMode
    />
  );
}

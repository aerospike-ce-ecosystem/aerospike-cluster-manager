"use client"

import { useParams } from "next/navigation"

import { ackoSections } from "@/app/siteConfig"
import { ClusterDetailLayout } from "@/components/k8s/ClusterDetailLayout"

export default function AckoClusterDetailPage() {
  const params = useParams<{ namespace: string; name: string }>()
  const namespace = params?.namespace ?? ""
  const name = params?.name ?? ""

  if (!namespace || !name) {
    return null
  }

  return (
    <ClusterDetailLayout
      namespace={namespace}
      name={name}
      onDeletedHref={ackoSections.list()}
    />
  )
}

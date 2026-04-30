"use client"

import { Card } from "@/components/Card"
import type { CreateK8sClusterRequest } from "@/lib/types/k8s"

interface StepReviewProps {
  form: CreateK8sClusterRequest
  templateName: string | null
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return "—"
  const gi = bytes / 1_073_741_824
  if (gi >= 1) return `${gi} GiB`
  const mi = bytes / 1_048_576
  return `${Math.round(mi)} MiB`
}

export function StepReview({ form, templateName }: StepReviewProps) {
  const requests = form.resources?.requests
  const limits = form.resources?.limits
  const namespaces = form.namespaces ?? []

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        Review
      </h2>

      <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name" value={form.name ?? "—"} />
        <Field label="Namespace" value={form.namespace ?? "—"} />
        <Field
          label="Size"
          value={`${form.size ?? 1} node${(form.size ?? 1) > 1 ? "s" : ""}`}
        />
        <Field label="Image" value={form.image ?? "—"} />
        {templateName && <Field label="Template" value={templateName} />}
        <Field
          label="Resources"
          value={
            requests || limits
              ? `CPU: ${requests?.cpu ?? "—"} / ${limits?.cpu ?? "—"}  ·  Mem: ${requests?.memory ?? "—"} / ${limits?.memory ?? "—"}`
              : "defaults"
          }
        />
        <Field label="Auto-connect" value={form.autoConnect ? "Yes" : "No"} />
        <Field
          label="Monitoring"
          value={
            form.monitoring?.enabled
              ? `Enabled (port ${form.monitoring.port ?? 9145})`
              : "Disabled"
          }
        />
        <Field
          label="Dynamic Config"
          value={form.enableDynamicConfig ? "Enabled" : "Disabled"}
        />
        <Field
          label="Rolling Update"
          value={
            form.rollingUpdate &&
            (form.rollingUpdate.batchSize !== undefined ||
              form.rollingUpdate.maxUnavailable !== undefined ||
              form.rollingUpdate.disablePDB)
              ? `batchSize=${form.rollingUpdate.batchSize ?? "—"}, maxUnavailable=${form.rollingUpdate.maxUnavailable ?? "—"}${form.rollingUpdate.disablePDB ? ", PDB disabled" : ""}`
              : "Default"
          }
        />
        <Field
          label="ACL"
          value={
            form.acl?.enabled
              ? `${form.acl.users?.length ?? 0} user(s), ${form.acl.roles?.length ?? 0} role(s)`
              : "Disabled"
          }
        />
        <Field
          label="Racks"
          value={
            form.rackConfig?.racks && form.rackConfig.racks.length > 0
              ? `${form.rackConfig.racks.length} rack(s)`
              : "Single rack"
          }
        />
        <Field
          label="Sidecars / Init"
          value={
            (form.sidecars?.length ?? 0) + (form.initContainers?.length ?? 0) >
            0
              ? `${form.sidecars?.length ?? 0} sidecar(s), ${form.initContainers?.length ?? 0} init`
              : "None"
          }
        />
        <Field
          label="Network Access"
          value={form.networkPolicy?.accessType ?? "pod"}
        />
        <Field
          label="Nodes blocked"
          value={(form.k8sNodeBlockList?.length ?? 0).toString()}
        />
        <Field
          label="Bandwidth"
          value={
            form.bandwidthConfig?.ingress || form.bandwidthConfig?.egress
              ? `in=${form.bandwidthConfig?.ingress ?? "—"}, out=${form.bandwidthConfig?.egress ?? "—"}`
              : "No limits"
          }
        />
      </dl>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">
          Namespaces ({namespaces.length})
        </h3>
        <div className="flex flex-col gap-3">
          {namespaces.map((ns, i) => {
            const type = ns.storageEngine?.type ?? "memory"
            const storageSummary =
              type === "memory"
                ? `In-Memory (${formatBytes(ns.storageEngine?.dataSize)})`
                : `Device (${ns.storageEngine?.file ?? "—"}, ${formatBytes(ns.storageEngine?.filesize)})`
            return (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 rounded-md bg-gray-50 p-3 text-sm md:grid-cols-3 dark:bg-gray-900/60"
              >
                <div>
                  <div className="text-xs text-gray-500">Name</div>
                  <div className="font-medium text-gray-900 dark:text-gray-50">
                    {ns.name ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Storage</div>
                  <div className="font-medium text-gray-900 dark:text-gray-50">
                    {storageSummary}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Replication</div>
                  <div className="font-medium text-gray-900 dark:text-gray-50">
                    {ns.replicationFactor ?? 1}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-50">{value}</dd>
    </div>
  )
}

"use client";

import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import { AEROSPIKE_IMAGES, CE_LIMITS } from "@/lib/validations/k8s";
import type { CreateK8sClusterRequest } from "@/lib/types/k8s";

interface StepBasicProps {
  form: CreateK8sClusterRequest;
  namespaces: string[];
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void;
  templateMode?: boolean;
}

export function StepBasic({ form, namespaces, updateForm, templateMode }: StepBasicProps) {
  const requests = form.resources?.requests ?? { cpu: "500m", memory: "1Gi" };
  const limits = form.resources?.limits ?? { cpu: "2", memory: "4Gi" };

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        {templateMode ? "Name & Namespace" : "Basic & Resources"}
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cluster-name">Cluster Name</Label>
          <Input
            id="cluster-name"
            value={form.name ?? ""}
            onChange={(e) => updateForm({ name: e.target.value })}
            placeholder="my-cluster"
            autoFocus
            required
          />
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Lowercase letters, numbers, and hyphens only (K8s DNS name).
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cluster-namespace">Namespace</Label>
          <select
            id="cluster-namespace"
            value={form.namespace ?? ""}
            onChange={(e) => updateForm({ namespace: e.target.value })}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            required
          >
            <option value="">Select a namespace</option>
            {namespaces.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!templateMode && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cluster-size">Size (1-{CE_LIMITS.MAX_NODES} nodes)</Label>
            <Input
              id="cluster-size"
              type="number"
              min={1}
              max={CE_LIMITS.MAX_NODES}
              value={String(form.size ?? 1)}
              onChange={(e) => updateForm({ size: Number.parseInt(e.target.value, 10) || 1 })}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cluster-image">Aerospike Image</Label>
            <select
              id="cluster-image"
              value={form.image ?? AEROSPIKE_IMAGES[0]}
              onChange={(e) => updateForm({ image: e.target.value })}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {AEROSPIKE_IMAGES.map((img) => (
                <option key={img} value={img}>
                  {img}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!templateMode && (
        <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
          <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">Resources</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpu-request">CPU Request</Label>
              <Input
                id="cpu-request"
                value={requests.cpu ?? "500m"}
                onChange={(e) =>
                  updateForm({
                    resources: {
                      requests: { ...requests, cpu: e.target.value },
                      limits,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cpu-limit">CPU Limit</Label>
              <Input
                id="cpu-limit"
                value={limits.cpu ?? "2"}
                onChange={(e) =>
                  updateForm({
                    resources: {
                      requests,
                      limits: { ...limits, cpu: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mem-request">Memory Request</Label>
              <Input
                id="mem-request"
                value={requests.memory ?? "1Gi"}
                onChange={(e) =>
                  updateForm({
                    resources: {
                      requests: { ...requests, memory: e.target.value },
                      limits,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mem-limit">Memory Limit</Label>
              <Input
                id="mem-limit"
                value={limits.memory ?? "4Gi"}
                onChange={(e) =>
                  updateForm({
                    resources: {
                      requests,
                      limits: { ...limits, memory: e.target.value },
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="auto-connect"
          checked={form.autoConnect ?? true}
          onCheckedChange={(checked) => updateForm({ autoConnect: checked === true })}
        />
        <Label htmlFor="auto-connect" className="cursor-pointer">
          Auto-connect after creation
        </Label>
      </div>
    </Card>
  );
}

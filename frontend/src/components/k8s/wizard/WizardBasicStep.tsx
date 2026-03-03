import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateK8sName } from "@/lib/validations/k8s";
import { AEROSPIKE_IMAGES } from "@/lib/constants";
import type { WizardBasicStepProps } from "./types";

export function WizardBasicStep({
  form,
  updateForm,
  k8sNamespaces,
  fetchingOptions,
}: WizardBasicStepProps) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="cluster-name">Cluster Name</Label>
        <Input
          id="cluster-name"
          placeholder="my-aerospike"
          value={form.name}
          onChange={(e) => updateForm({ name: e.target.value.toLowerCase() })}
        />
        {form.name.length > 0 && validateK8sName(form.name) ? (
          <p className="text-destructive text-xs">{validateK8sName(form.name)}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Lowercase letters, numbers, and hyphens only (K8s DNS name).
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="k8s-namespace">Namespace</Label>
        <Select
          value={form.namespace}
          onValueChange={(v) => updateForm({ namespace: v })}
        >
          <SelectTrigger id="k8s-namespace" disabled={fetchingOptions}>
            <SelectValue
              placeholder={fetchingOptions ? "Loading namespaces…" : "Select a namespace"}
            />
          </SelectTrigger>
          <SelectContent>
            {k8sNamespaces.length > 0 ? (
              k8sNamespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>
                  {ns}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="" disabled>
                No namespaces available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {!fetchingOptions && k8sNamespaces.length === 0 && (
          <p className="text-destructive text-xs">
            Failed to load namespaces. Check backend connectivity.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="cluster-size">Cluster Size (1-8 nodes)</Label>
        <Input
          id="cluster-size"
          type="number"
          min={1}
          max={8}
          value={form.size}
          onChange={(e) =>
            updateForm({
              size: Math.min(8, Math.max(1, parseInt(e.target.value) || 1)),
            })
          }
        />
      </div>

      <div className="grid gap-2">
        <Label>Aerospike Image</Label>
        <Select value={form.image} onValueChange={(v) => updateForm({ image: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AEROSPIKE_IMAGES.map((img) => (
              <SelectItem key={img} value={img}>
                {img}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

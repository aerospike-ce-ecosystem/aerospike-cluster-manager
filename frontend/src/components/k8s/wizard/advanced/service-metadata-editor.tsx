import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ServiceMetadataConfig } from "@/lib/api/types";

interface ServiceMetadataEditorProps {
  title: string;
  description: string;
  value: ServiceMetadataConfig | undefined;
  onChange: (v: ServiceMetadataConfig | undefined) => void;
}

/** Service Metadata editor for headless and pod services. */
export function ServiceMetadataEditor({
  description,
  value,
  onChange,
}: ServiceMetadataEditorProps) {
  const [annotationKey, setAnnotationKey] = useState("");
  const [annotationVal, setAnnotationVal] = useState("");
  const [labelKey, setLabelKey] = useState("");
  const [labelVal, setLabelVal] = useState("");

  const addAnnotation = () => {
    const k = annotationKey.trim();
    const v = annotationVal.trim();
    if (!k) return;
    const next = { ...value, annotations: { ...(value?.annotations ?? {}), [k]: v } };
    onChange(next);
    setAnnotationKey("");
    setAnnotationVal("");
  };

  const removeAnnotation = (key: string) => {
    const annotations = { ...(value?.annotations ?? {}) };
    delete annotations[key];
    const next = {
      ...value,
      annotations: Object.keys(annotations).length > 0 ? annotations : undefined,
    };
    if (!next.annotations && !next.labels) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  const addLabel = () => {
    const k = labelKey.trim();
    const v = labelVal.trim();
    if (!k) return;
    const next = { ...value, labels: { ...(value?.labels ?? {}), [k]: v } };
    onChange(next);
    setLabelKey("");
    setLabelVal("");
  };

  const removeLabel = (key: string) => {
    const labels = { ...(value?.labels ?? {}) };
    delete labels[key];
    const next = {
      ...value,
      labels: Object.keys(labels).length > 0 ? labels : undefined,
    };
    if (!next.annotations && !next.labels) {
      onChange(undefined);
    } else {
      onChange(next);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{description}</p>

      {/* Annotations */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Annotations</Label>
        {Object.entries(value?.annotations ?? {}).length > 0 && (
          <div className="space-y-1">
            {Object.entries(value!.annotations!).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <code className="bg-muted truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
                <span className="text-muted-foreground text-[10px]">=</span>
                <code className="bg-muted flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">
                  {v}
                </code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeAnnotation(k)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="annotation key"
            value={annotationKey}
            onChange={(e) => setAnnotationKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAnnotation())}
          />
          <Input
            className="h-8 text-xs"
            placeholder="value"
            value={annotationVal}
            onChange={(e) => setAnnotationVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAnnotation())}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addAnnotation}
            disabled={!annotationKey.trim()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Labels */}
      <div className="grid gap-2">
        <Label className="text-xs font-semibold">Labels</Label>
        {Object.entries(value?.labels ?? {}).length > 0 && (
          <div className="space-y-1">
            {Object.entries(value!.labels!).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <code className="bg-muted truncate rounded px-1.5 py-0.5 text-[10px]">{k}</code>
                <span className="text-muted-foreground text-[10px]">=</span>
                <code className="bg-muted flex-1 truncate rounded px-1.5 py-0.5 text-[10px]">
                  {v}
                </code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => removeLabel(k)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            className="h-8 text-xs"
            placeholder="label key"
            value={labelKey}
            onChange={(e) => setLabelKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
          />
          <Input
            className="h-8 text-xs"
            placeholder="value"
            value={labelVal}
            onChange={(e) => setLabelVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            onClick={addLabel}
            disabled={!labelKey.trim()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

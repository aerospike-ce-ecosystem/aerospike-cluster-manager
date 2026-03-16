import { useState, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CustomRulesEditorProps {
  value: Record<string, unknown>[] | undefined;
  onChange: (v: Record<string, unknown>[] | undefined) => void;
}

/** Custom Prometheus rule groups editor using a JSON textarea. */
export function CustomRulesEditor({ value, onChange }: CustomRulesEditorProps) {
  const [rawText, setRawText] = useState(() => (value ? JSON.stringify(value, null, 2) : ""));
  const [parseError, setParseError] = useState<string | null>(null);

  const handleChange = useCallback(
    (text: string) => {
      setRawText(text);
      if (!text.trim()) {
        setParseError(null);
        onChange(undefined);
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          setParseError("Must be a JSON array of rule groups");
          return;
        }
        setParseError(null);
        onChange(parsed);
      } catch {
        setParseError("Invalid JSON");
      }
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <Label className="text-xs">Custom Rule Groups (JSON)</Label>
      <p className="text-muted-foreground text-xs">
        Define custom Prometheus alerting/recording rule groups. Must be a JSON array of rule group
        objects following the <code className="bg-muted rounded px-1 text-[10px]">groups</code>{" "}
        schema.
      </p>
      <Textarea
        value={rawText}
        onChange={(e) => handleChange(e.target.value)}
        rows={8}
        className="font-mono text-xs"
        placeholder={`[\n  {\n    "name": "aerospike-alerts",\n    "rules": [\n      {\n        "alert": "AerospikeHighMemory",\n        "expr": "aerospike_namespace_memory_used_bytes > 0.8",\n        "for": "5m",\n        "labels": { "severity": "warning" },\n        "annotations": { "summary": "High memory usage" }\n      }\n    ]\n  }\n]`}
      />
      {parseError && <p className="text-xs text-error">{parseError}</p>}
    </div>
  );
}

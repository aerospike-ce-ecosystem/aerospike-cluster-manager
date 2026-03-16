import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  VolumeSpec,
  VolumeSourceType,
  VolumeInitMethod,
  VolumeWipeMethod,
} from "@/lib/api/types";
import { SOURCE_TYPE_LABELS } from "./storage-utils";

interface VolumeEditorProps {
  vol: VolumeSpec;
  index: number;
  storageClasses: string[];
  onChange: (updated: VolumeSpec) => void;
  onRemove: () => void;
}

export function VolumeEditor({
  vol,
  index,
  storageClasses,
  onChange,
  onRemove,
}: VolumeEditorProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Volume: {vol.name || `(unnamed ${index + 1})`}
          <span className="text-muted-foreground ml-1 text-xs font-normal">
            [{SOURCE_TYPE_LABELS[vol.source]}]
          </span>
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 pl-1">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`vol-name-${index}`}>Volume Name</Label>
              <Input
                id={`vol-name-${index}`}
                value={vol.name}
                onChange={(e) => onChange({ ...vol, name: e.target.value })}
                placeholder="e.g. data-vol"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`vol-source-${index}`}>Source Type</Label>
              <Select
                value={vol.source}
                onValueChange={(v) => {
                  const src = v as VolumeSourceType;
                  const updated: VolumeSpec = { ...vol, source: src };
                  // Reset source-specific fields
                  if (src === "persistentVolume") {
                    updated.persistentVolume = {
                      storageClass: storageClasses[0] || "standard",
                      size: "10Gi",
                      volumeMode: "Filesystem",
                      accessModes: ["ReadWriteOnce"],
                    };
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "emptyDir") {
                    updated.emptyDir = {};
                    updated.persistentVolume = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "secret") {
                    updated.secret = { secretName: "" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.configMap = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "configMap") {
                    updated.configMap = { name: "" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.hostPath = undefined;
                  } else if (src === "hostPath") {
                    updated.hostPath = { path: "", type: "DirectoryOrCreate" };
                    updated.persistentVolume = undefined;
                    updated.emptyDir = undefined;
                    updated.secret = undefined;
                    updated.configMap = undefined;
                  }
                  onChange(updated);
                }}
              >
                <SelectTrigger id={`vol-source-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* PVC-specific fields */}
          {vol.source === "persistentVolume" && vol.persistentVolume && (
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Storage Class</Label>
                <Select
                  value={vol.persistentVolume.storageClass || "standard"}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: { ...vol.persistentVolume!, storageClass: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storageClasses.length > 0 ? (
                      storageClasses.map((sc) => (
                        <SelectItem key={sc} value={sc}>
                          {sc}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="standard">standard</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Size</Label>
                <Select
                  value={vol.persistentVolume.size}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: { ...vol.persistentVolume!, size: v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1Gi">1 GiB</SelectItem>
                    <SelectItem value="5Gi">5 GiB</SelectItem>
                    <SelectItem value="10Gi">10 GiB</SelectItem>
                    <SelectItem value="20Gi">20 GiB</SelectItem>
                    <SelectItem value="50Gi">50 GiB</SelectItem>
                    <SelectItem value="100Gi">100 GiB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Volume Mode</Label>
                <Select
                  value={vol.persistentVolume.volumeMode || "Filesystem"}
                  onValueChange={(v) =>
                    onChange({
                      ...vol,
                      persistentVolume: {
                        ...vol.persistentVolume!,
                        volumeMode: v as "Filesystem" | "Block",
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Filesystem">Filesystem</SelectItem>
                    <SelectItem value="Block">Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Secret source */}
          {vol.source === "secret" && (
            <div className="grid gap-2">
              <Label>Secret Name</Label>
              <Input
                value={(vol.secret as Record<string, string>)?.secretName || ""}
                onChange={(e) =>
                  onChange({ ...vol, secret: { ...vol.secret, secretName: e.target.value } })
                }
                placeholder="my-secret"
              />
            </div>
          )}

          {/* ConfigMap source */}
          {vol.source === "configMap" && (
            <div className="grid gap-2">
              <Label>ConfigMap Name</Label>
              <Input
                value={(vol.configMap as Record<string, string>)?.name || ""}
                onChange={(e) =>
                  onChange({ ...vol, configMap: { ...vol.configMap, name: e.target.value } })
                }
                placeholder="my-config"
              />
            </div>
          )}

          {/* HostPath source */}
          {vol.source === "hostPath" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Host Path</Label>
                <Input
                  value={(vol.hostPath as Record<string, string>)?.path || ""}
                  onChange={(e) =>
                    onChange({ ...vol, hostPath: { ...vol.hostPath, path: e.target.value } })
                  }
                  placeholder="/data/aerospike"
                />
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={(vol.hostPath as Record<string, string>)?.type || "DirectoryOrCreate"}
                  onValueChange={(v) =>
                    onChange({ ...vol, hostPath: { ...vol.hostPath, type: v } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DirectoryOrCreate">DirectoryOrCreate</SelectItem>
                    <SelectItem value="Directory">Directory</SelectItem>
                    <SelectItem value="FileOrCreate">FileOrCreate</SelectItem>
                    <SelectItem value="File">File</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Mount path (Aerospike container) */}
          <div className="grid gap-2">
            <Label>Mount Path (Aerospike Container)</Label>
            <Input
              value={vol.aerospike?.path || ""}
              onChange={(e) =>
                onChange({
                  ...vol,
                  aerospike: { ...vol.aerospike, path: e.target.value },
                })
              }
              placeholder="/opt/aerospike/data"
            />
          </div>

          {/* Init / Wipe / Cascade */}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Init Method</Label>
              <Select
                value={vol.initMethod || "none"}
                onValueChange={(v) =>
                  onChange({
                    ...vol,
                    initMethod: v === "none" ? undefined : (v as VolumeInitMethod),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="deleteFiles">Delete Files</SelectItem>
                  <SelectItem value="dd">DD (zero-fill)</SelectItem>
                  <SelectItem value="blkdiscard">Block Discard</SelectItem>
                  <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Wipe Method</Label>
              <Select
                value={vol.wipeMethod || "none"}
                onValueChange={(v) =>
                  onChange({
                    ...vol,
                    wipeMethod: v === "none" ? undefined : (v as VolumeWipeMethod),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="deleteFiles">Delete Files</SelectItem>
                  <SelectItem value="dd">DD (zero-fill)</SelectItem>
                  <SelectItem value="blkdiscard">Block Discard</SelectItem>
                  <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                  <SelectItem value="blkdiscardWithHeaderCleanup">
                    Block Discard + Header
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id={`cascade-delete-${index}`}
                checked={vol.cascadeDelete ?? false}
                onCheckedChange={(checked) => onChange({ ...vol, cascadeDelete: checked === true })}
              />
              <Label htmlFor={`cascade-delete-${index}`} className="text-sm font-normal">
                Cascade Delete
              </Label>
            </div>
          </div>

          {/* Read-only mount */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`read-only-${index}`}
              checked={vol.aerospike?.readOnly ?? false}
              onCheckedChange={(checked) =>
                onChange({
                  ...vol,
                  aerospike: {
                    ...vol.aerospike,
                    path: vol.aerospike?.path || "",
                    readOnly: checked === true,
                  },
                })
              }
            />
            <Label htmlFor={`read-only-${index}`} className="text-sm font-normal">
              Mount read-only
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

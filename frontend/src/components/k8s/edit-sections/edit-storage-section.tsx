"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import type {
  VolumeSpec,
  VolumeSourceType,
  VolumeInitMethod,
  VolumeWipeMethod,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// EditStorageSection -- multi-volume storage editing
// ---------------------------------------------------------------------------

const VOLUME_SOURCE_LABELS: Record<VolumeSourceType, string> = {
  persistentVolume: "PVC",
  emptyDir: "EmptyDir",
  secret: "Secret",
  configMap: "ConfigMap",
  hostPath: "HostPath",
};

export function EditStorageSection({
  volumes,
  cleanupThreads,
  deleteLocalOnRestart,
  onVolumesChange,
  onCleanupThreadsChange,
  onDeleteLocalChange,
  loading,
}: {
  volumes: VolumeSpec[];
  cleanupThreads: number | undefined;
  deleteLocalOnRestart: boolean;
  onVolumesChange: (v: VolumeSpec[]) => void;
  onCleanupThreadsChange: (v: number | undefined) => void;
  onDeleteLocalChange: (v: boolean) => void;
  loading: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const updateVolume = (index: number, updated: VolumeSpec) => {
    const next = [...volumes];
    next[index] = updated;
    onVolumesChange(next);
  };

  const removeVolume = (index: number) => {
    onVolumesChange(volumes.filter((_, i) => i !== index));
    if (expandedIdx === index) setExpandedIdx(null);
  };

  const addVolume = (type: VolumeSourceType) => {
    const n = volumes.length + 1;
    const vol: VolumeSpec = {
      name: `vol-${n}`,
      source: type,
      aerospike: {
        path: type === "persistentVolume" ? "/opt/aerospike/data" : "/opt/aerospike/work",
      },
    };
    if (type === "persistentVolume") {
      vol.persistentVolume = {
        size: "10Gi",
        volumeMode: "Filesystem",
        accessModes: ["ReadWriteOnce"],
      };
    } else if (type === "emptyDir") {
      vol.emptyDir = {};
    } else if (type === "secret") {
      vol.secret = { secretName: "" };
    } else if (type === "configMap") {
      vol.configMap = { name: "" };
    } else if (type === "hostPath") {
      vol.hostPath = { path: "", type: "DirectoryOrCreate" };
    }
    onVolumesChange([...volumes, vol]);
    setExpandedIdx(volumes.length);
  };

  return (
    <div className="space-y-3">
      {/* Add buttons */}
      <div className="flex flex-wrap gap-1">
        {(Object.entries(VOLUME_SOURCE_LABELS) as [VolumeSourceType, string][]).map(
          ([type, label]) => (
            <button
              key={type}
              type="button"
              disabled={loading}
              onClick={() => addVolume(type)}
              className="text-accent hover:text-accent/80 flex items-center gap-0.5 text-[10px] font-medium disabled:opacity-50"
            >
              <Plus className="h-3 w-3" /> {label}
            </button>
          ),
        )}
      </div>

      {volumes.length === 0 && (
        <p className="text-muted-foreground py-2 text-center text-xs">No volumes configured.</p>
      )}

      {volumes.map((vol, vi) => {
        const isExpanded = expandedIdx === vi;
        return (
          <div key={vi} className="rounded border">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium"
                onClick={() => setExpandedIdx(isExpanded ? null : vi)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {vol.name || `vol-${vi + 1}`}
                <span className="text-muted-foreground text-[10px] font-normal">
                  [{VOLUME_SOURCE_LABELS[vol.source]}]
                </span>
                {vol.source === "persistentVolume" && vol.persistentVolume && (
                  <span className="text-muted-foreground text-[10px]">
                    {vol.persistentVolume.size}
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => removeVolume(vi)}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {isExpanded && (
              <div className="space-y-2 border-t px-2 pt-2 pb-2">
                {/* Name and source type */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Name</Label>
                    <Input
                      value={vol.name}
                      onChange={(e) => updateVolume(vi, { ...vol, name: e.target.value })}
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Source</Label>
                    <Select
                      value={vol.source}
                      onValueChange={(v) => {
                        const src = v as VolumeSourceType;
                        const updated: VolumeSpec = { ...vol, source: src };
                        if (src === "persistentVolume") {
                          updated.persistentVolume = {
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
                        updateVolume(vi, updated);
                      }}
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(VOLUME_SOURCE_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* PVC source fields */}
                {vol.source === "persistentVolume" && vol.persistentVolume && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Storage Class</Label>
                      <Input
                        value={vol.persistentVolume.storageClass || ""}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: {
                              ...vol.persistentVolume!,
                              storageClass: e.target.value,
                            },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                        placeholder="standard"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Size</Label>
                      <Input
                        value={vol.persistentVolume.size}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: { ...vol.persistentVolume!, size: e.target.value },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                        placeholder="10Gi"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Volume Mode</Label>
                      <Select
                        value={vol.persistentVolume.volumeMode || "Filesystem"}
                        onValueChange={(v) =>
                          updateVolume(vi, {
                            ...vol,
                            persistentVolume: {
                              ...vol.persistentVolume!,
                              volumeMode: v as "Filesystem" | "Block",
                            },
                          })
                        }
                        disabled={loading}
                      >
                        <SelectTrigger className="h-7 text-xs">
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

                {/* Secret */}
                {vol.source === "secret" && (
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Secret Name</Label>
                    <Input
                      value={(vol.secret as Record<string, string>)?.secretName || ""}
                      onChange={(e) =>
                        updateVolume(vi, {
                          ...vol,
                          secret: { ...vol.secret, secretName: e.target.value },
                        })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                )}

                {/* ConfigMap */}
                {vol.source === "configMap" && (
                  <div className="grid gap-1">
                    <Label className="text-[10px]">ConfigMap Name</Label>
                    <Input
                      value={(vol.configMap as Record<string, string>)?.name || ""}
                      onChange={(e) =>
                        updateVolume(vi, {
                          ...vol,
                          configMap: { ...vol.configMap, name: e.target.value },
                        })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                )}

                {/* HostPath */}
                {vol.source === "hostPath" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Path</Label>
                      <Input
                        value={(vol.hostPath as Record<string, string>)?.path || ""}
                        onChange={(e) =>
                          updateVolume(vi, {
                            ...vol,
                            hostPath: { ...vol.hostPath, path: e.target.value },
                          })
                        }
                        className="h-7 text-xs"
                        disabled={loading}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px]">Type</Label>
                      <Select
                        value={
                          (vol.hostPath as Record<string, string>)?.type || "DirectoryOrCreate"
                        }
                        onValueChange={(v) =>
                          updateVolume(vi, { ...vol, hostPath: { ...vol.hostPath, type: v } })
                        }
                        disabled={loading}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DirectoryOrCreate">DirectoryOrCreate</SelectItem>
                          <SelectItem value="Directory">Directory</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Mount path */}
                <div className="grid gap-1">
                  <Label className="text-[10px]">Mount Path</Label>
                  <Input
                    value={vol.aerospike?.path || ""}
                    onChange={(e) =>
                      updateVolume(vi, {
                        ...vol,
                        aerospike: { ...vol.aerospike, path: e.target.value },
                      })
                    }
                    className="h-7 text-xs"
                    disabled={loading}
                    placeholder="/opt/aerospike/data"
                  />
                </div>

                {/* Init/Wipe/Cascade */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Init Method</Label>
                    <Select
                      value={vol.initMethod || "none"}
                      onValueChange={(v) =>
                        updateVolume(vi, {
                          ...vol,
                          initMethod: v === "none" ? undefined : (v as VolumeInitMethod),
                        })
                      }
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="deleteFiles">Delete Files</SelectItem>
                        <SelectItem value="dd">DD</SelectItem>
                        <SelectItem value="blkdiscard">Block Discard</SelectItem>
                        <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px]">Wipe Method</Label>
                    <Select
                      value={vol.wipeMethod || "none"}
                      onValueChange={(v) =>
                        updateVolume(vi, {
                          ...vol,
                          wipeMethod: v === "none" ? undefined : (v as VolumeWipeMethod),
                        })
                      }
                      disabled={loading}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="deleteFiles">Delete Files</SelectItem>
                        <SelectItem value="dd">DD</SelectItem>
                        <SelectItem value="blkdiscard">Block Discard</SelectItem>
                        <SelectItem value="headerCleanup">Header Cleanup</SelectItem>
                        <SelectItem value="blkdiscardWithHeaderCleanup">Blk+Header</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-1.5 pb-1">
                    <Checkbox
                      checked={vol.cascadeDelete ?? false}
                      onCheckedChange={(checked) =>
                        updateVolume(vi, { ...vol, cascadeDelete: checked === true })
                      }
                      disabled={loading}
                    />
                    <Label className="text-[10px]">Cascade</Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Global storage policies */}
      {volumes.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <Label className="text-muted-foreground text-[10px]">Global Policies</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px]">Cleanup Threads</Label>
              <Input
                type="number"
                min={1}
                value={cleanupThreads ?? 1}
                onChange={(e) => onCleanupThreadsChange(parseInt(e.target.value) || undefined)}
                className="h-7 text-xs"
                disabled={loading}
              />
            </div>
            <div className="flex items-end gap-1.5 pb-1">
              <Checkbox
                checked={deleteLocalOnRestart}
                onCheckedChange={(checked) => onDeleteLocalChange(checked === true)}
                disabled={loading}
              />
              <Label className="text-[10px]">Delete local PVCs on restart</Label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

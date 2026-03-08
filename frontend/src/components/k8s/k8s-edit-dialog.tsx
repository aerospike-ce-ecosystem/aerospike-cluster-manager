"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/common/loading-button";
import { getErrorMessage } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  K8sClusterDetail,
  UpdateK8sClusterRequest,
  NetworkAccessType,
  NetworkPolicyAutoConfig,
} from "@/lib/api/types";

interface K8sEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cluster: K8sClusterDetail;
  onSave: (data: UpdateK8sClusterRequest) => Promise<void>;
}

export function K8sEditDialog({ open, onOpenChange, cluster, onSave }: K8sEditDialogProps) {
  const [image, setImage] = useState("");
  const [size, setSize] = useState(1);
  const [enableDynamicConfig, setEnableDynamicConfig] = useState(false);
  const [aerospikeConfigText, setAerospikeConfigText] = useState("");
  const [batchSize, setBatchSize] = useState<number | undefined>(undefined);
  const [maxUnavailable, setMaxUnavailable] = useState("");
  const [disablePDB, setDisablePDB] = useState(false);
  const [accessType, setAccessType] = useState<NetworkAccessType>("pod");
  const [fabricType, setFabricType] = useState<NetworkAccessType | "">("");
  const [alternateAccessType, setAlternateAccessType] = useState<NetworkAccessType | "">("");
  const [customAccessNames, setCustomAccessNames] = useState("");
  const [customAltAccessNames, setCustomAltAccessNames] = useState("");
  const [customFabricNames, setCustomFabricNames] = useState("");
  const [networkPolicyConfig, setNetworkPolicyConfig] = useState<NetworkPolicyAutoConfig | null>(
    null,
  );
  const [nodeBlockList, setNodeBlockList] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Derive initial values from the cluster spec
  const initialImage = cluster.image;
  const initialSize = cluster.size;
  const initialEnableDynamicConfig = Boolean(cluster.spec?.enableDynamicConfigUpdate);
  const initialBatchSize = cluster.spec?.rollingUpdateBatchSize ?? undefined;
  const initialMaxUnavailable = String(cluster.spec?.maxUnavailable ?? "");
  const initialDisablePDB = Boolean(cluster.spec?.disablePDB);
  const networkPolicy = cluster.spec?.aerospikeNetworkPolicy;
  const initialAccessType = (networkPolicy?.accessType || "pod") as NetworkAccessType;
  const initialFabricType = (networkPolicy?.fabricType || "") as NetworkAccessType | "";
  const initialAlternateAccessType = (networkPolicy?.alternateAccessType || "") as
    | NetworkAccessType
    | "";
  const initialCustomAccessNames = (networkPolicy?.customAccessNetworkNames ?? []).join(", ");
  const initialCustomAltAccessNames = (networkPolicy?.customAlternateAccessNetworkNames ?? []).join(
    ", ",
  );
  const initialCustomFabricNames = (networkPolicy?.customFabricNetworkNames ?? []).join(", ");
  const initialNetworkPolicyConfig = cluster.spec?.networkPolicyConfig ?? null;
  const initialNodeBlockList = (cluster.spec?.k8sNodeBlockList ?? []).join(", ");
  const initialAerospikeConfig = useMemo(
    () => cluster.spec?.aerospikeConfig ?? {},
    [cluster.spec?.aerospikeConfig],
  );
  const initialAerospikeConfigText = useMemo(
    () => JSON.stringify(initialAerospikeConfig, null, 2),
    [initialAerospikeConfig],
  );

  // Reset form state when the dialog opens
  useEffect(() => {
    if (open) {
      setImage(initialImage);
      setSize(initialSize);
      setEnableDynamicConfig(initialEnableDynamicConfig);
      setAerospikeConfigText(initialAerospikeConfigText);
      setBatchSize(initialBatchSize);
      setMaxUnavailable(initialMaxUnavailable);
      setDisablePDB(initialDisablePDB);
      setAccessType(initialAccessType);
      setFabricType(initialFabricType);
      setAlternateAccessType(initialAlternateAccessType);
      setCustomAccessNames(initialCustomAccessNames);
      setCustomAltAccessNames(initialCustomAltAccessNames);
      setCustomFabricNames(initialCustomFabricNames);
      setNetworkPolicyConfig(initialNetworkPolicyConfig);
      setNodeBlockList(initialNodeBlockList);
      setError(null);
      setConfigError(null);
    }
  }, [
    open,
    initialImage,
    initialSize,
    initialEnableDynamicConfig,
    initialAerospikeConfigText,
    initialBatchSize,
    initialMaxUnavailable,
    initialDisablePDB,
    initialAccessType,
    initialFabricType,
    initialAlternateAccessType,
    initialCustomAccessNames,
    initialCustomAltAccessNames,
    initialCustomFabricNames,
    initialNetworkPolicyConfig,
    initialNodeBlockList,
  ]);

  // Validate JSON on every keystroke
  useEffect(() => {
    if (!aerospikeConfigText.trim()) {
      setConfigError(null);
      return;
    }
    try {
      JSON.parse(aerospikeConfigText);
      setConfigError(null);
    } catch {
      setConfigError("Invalid JSON");
    }
  }, [aerospikeConfigText]);

  const hasChanges =
    image !== initialImage ||
    size !== initialSize ||
    enableDynamicConfig !== initialEnableDynamicConfig ||
    aerospikeConfigText !== initialAerospikeConfigText ||
    batchSize !== initialBatchSize ||
    maxUnavailable !== initialMaxUnavailable ||
    disablePDB !== initialDisablePDB ||
    accessType !== initialAccessType ||
    fabricType !== initialFabricType ||
    alternateAccessType !== initialAlternateAccessType ||
    customAccessNames !== initialCustomAccessNames ||
    customAltAccessNames !== initialCustomAltAccessNames ||
    customFabricNames !== initialCustomFabricNames ||
    JSON.stringify(networkPolicyConfig) !== JSON.stringify(initialNetworkPolicyConfig) ||
    nodeBlockList !== initialNodeBlockList;

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: UpdateK8sClusterRequest = {};

      if (size !== initialSize) {
        data.size = size;
      }
      if (image !== initialImage) {
        data.image = image;
      }
      if (enableDynamicConfig !== initialEnableDynamicConfig) {
        data.enableDynamicConfig = enableDynamicConfig;
      }
      if (aerospikeConfigText !== initialAerospikeConfigText) {
        const parsed = JSON.parse(aerospikeConfigText) as Record<string, unknown>;
        data.aerospikeConfig = parsed;
      }
      if (batchSize !== initialBatchSize && batchSize !== undefined) {
        data.rollingUpdateBatchSize = batchSize;
      }
      if (maxUnavailable !== initialMaxUnavailable && maxUnavailable !== "") {
        data.maxUnavailable = maxUnavailable;
      }
      if (disablePDB !== initialDisablePDB) {
        data.disablePDB = disablePDB;
      }
      if (
        accessType !== initialAccessType ||
        fabricType !== initialFabricType ||
        alternateAccessType !== initialAlternateAccessType ||
        customAccessNames !== initialCustomAccessNames ||
        customAltAccessNames !== initialCustomAltAccessNames ||
        customFabricNames !== initialCustomFabricNames
      ) {
        const parseNames = (s: string) => {
          const names = s
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          return names.length > 0 ? names : undefined;
        };
        data.networkPolicy = {
          accessType,
          ...(fabricType ? { fabricType: fabricType as NetworkAccessType } : {}),
          ...(alternateAccessType
            ? { alternateAccessType: alternateAccessType as NetworkAccessType }
            : {}),
          ...(accessType === "configuredIP"
            ? { customAccessNetworkNames: parseNames(customAccessNames) }
            : {}),
          ...(alternateAccessType === "configuredIP"
            ? { customAlternateAccessNetworkNames: parseNames(customAltAccessNames) }
            : {}),
          ...(fabricType === "configuredIP"
            ? { customFabricNetworkNames: parseNames(customFabricNames) }
            : {}),
        };
      }
      if (JSON.stringify(networkPolicyConfig) !== JSON.stringify(initialNetworkPolicyConfig)) {
        data.networkPolicyConfig = networkPolicyConfig ?? undefined;
      }
      if (nodeBlockList !== initialNodeBlockList) {
        const nodes = nodeBlockList
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        data.k8sNodeBlockList = nodes;
      }

      await onSave(data);
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Cluster</DialogTitle>
          <DialogDescription>
            Modify the configuration for &quot;{cluster.name}&quot;. Only changed fields will be
            applied.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Image */}
          <div className="grid gap-2">
            <Label htmlFor="edit-image">Image</Label>
            <Input
              id="edit-image"
              value={image}
              onChange={(e) => {
                setImage(e.target.value);
                setError(null);
              }}
              placeholder="aerospike:ce-8.1.1.1"
              disabled={loading}
            />
          </div>

          {/* Size */}
          <div className="grid gap-2">
            <Label htmlFor="edit-size">Cluster Size (1-8)</Label>
            <Input
              id="edit-size"
              type="number"
              min={1}
              max={8}
              value={size}
              onChange={(e) => {
                setSize(Math.min(8, Math.max(1, parseInt(e.target.value) || 1)));
                setError(null);
              }}
              disabled={loading}
            />
            {size < initialSize && (
              <p className="text-warning text-sm">
                Scaling down will remove nodes. Data may be lost if not replicated.
              </p>
            )}
          </div>

          {/* Enable Dynamic Config */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-dynamic-config"
              checked={enableDynamicConfig}
              onCheckedChange={(checked) => {
                setEnableDynamicConfig(checked === true);
                setError(null);
              }}
              disabled={loading}
            />
            <Label htmlFor="edit-dynamic-config" className="cursor-pointer">
              Enable Dynamic Config Update
            </Label>
          </div>

          {/* Rolling Update Strategy */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Rolling Update Strategy</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-batch-size" className="text-xs">
                  Batch Size
                </Label>
                <Input
                  id="edit-batch-size"
                  type="number"
                  min={1}
                  value={batchSize ?? ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setBatchSize(isNaN(val) ? undefined : Math.max(1, val));
                    setError(null);
                  }}
                  placeholder="e.g. 1"
                  disabled={loading}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-max-unavailable" className="text-xs">
                  Max Unavailable
                </Label>
                <Input
                  id="edit-max-unavailable"
                  value={maxUnavailable}
                  onChange={(e) => {
                    setMaxUnavailable(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. 1 or 25%"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-disable-pdb"
                checked={disablePDB}
                onCheckedChange={(checked) => {
                  setDisablePDB(checked === true);
                  setError(null);
                }}
                disabled={loading}
              />
              <Label htmlFor="edit-disable-pdb" className="cursor-pointer text-xs">
                Disable PodDisruptionBudget (PDB)
              </Label>
            </div>
          </div>

          {/* Network Policy */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Network Policy</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="edit-access-type" className="text-xs">
                  Access Type
                </Label>
                <Select
                  value={accessType}
                  onValueChange={(v) => {
                    setAccessType(v as NetworkAccessType);
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-access-type" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                    <SelectItem value="configuredIP">Configured IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-fabric-type" className="text-xs">
                  Fabric Type
                </Label>
                <Select
                  value={fabricType || "default"}
                  onValueChange={(v) => {
                    setFabricType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-fabric-type" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (same as access)</SelectItem>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-alt-access" className="text-xs">
                  Alternate Access
                </Label>
                <Select
                  value={alternateAccessType || "default"}
                  onValueChange={(v) => {
                    setAlternateAccessType(v === "default" ? "" : (v as NetworkAccessType));
                    setError(null);
                  }}
                >
                  <SelectTrigger id="edit-alt-access" disabled={loading}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">None</SelectItem>
                    <SelectItem value="pod">Pod IP</SelectItem>
                    <SelectItem value="hostInternal">Host Internal</SelectItem>
                    <SelectItem value="hostExternal">Host External</SelectItem>
                    <SelectItem value="configuredIP">Configured IP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Custom Network Names (shown when configuredIP is selected) */}
          {(accessType === "configuredIP" ||
            alternateAccessType === "configuredIP" ||
            fabricType === "configuredIP") && (
            <div className="grid gap-2 rounded border border-amber-200 p-3 dark:border-amber-800">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Custom network names required for configuredIP
              </span>
              {accessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-access" className="text-xs">
                    Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-access"
                    value={customAccessNames}
                    onChange={(e) => setCustomAccessNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
                  />
                </div>
              )}
              {alternateAccessType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-alt-access" className="text-xs">
                    Alternate Access Network Names
                  </Label>
                  <Input
                    id="edit-custom-alt-access"
                    value={customAltAccessNames}
                    onChange={(e) => setCustomAltAccessNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
                  />
                </div>
              )}
              {fabricType === "configuredIP" && (
                <div className="grid gap-1">
                  <Label htmlFor="edit-custom-fabric" className="text-xs">
                    Fabric Network Names
                  </Label>
                  <Input
                    id="edit-custom-fabric"
                    value={customFabricNames}
                    onChange={(e) => setCustomFabricNames(e.target.value)}
                    placeholder="networkName1, networkName2"
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          )}

          {/* NetworkPolicy Auto-generation */}
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-netpol-auto"
                checked={networkPolicyConfig?.enabled ?? false}
                onCheckedChange={(checked) => {
                  if (checked === true) {
                    setNetworkPolicyConfig({ enabled: true, type: "kubernetes" });
                  } else {
                    setNetworkPolicyConfig(null);
                  }
                  setError(null);
                }}
                disabled={loading}
              />
              <Label htmlFor="edit-netpol-auto" className="cursor-pointer text-xs">
                Auto-generate K8s NetworkPolicy
              </Label>
            </div>
            {networkPolicyConfig?.enabled && (
              <Select
                value={networkPolicyConfig.type}
                onValueChange={(v) => {
                  setNetworkPolicyConfig({
                    enabled: true,
                    type: v as "kubernetes" | "cilium",
                  });
                  setError(null);
                }}
              >
                <SelectTrigger disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kubernetes">Kubernetes (standard)</SelectItem>
                  <SelectItem value="cilium">Cilium</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Node Block List */}
          <div className="grid gap-1">
            <Label htmlFor="edit-node-blocklist" className="text-xs">
              Node Block List
            </Label>
            <Input
              id="edit-node-blocklist"
              value={nodeBlockList}
              onChange={(e) => {
                setNodeBlockList(e.target.value);
                setError(null);
              }}
              placeholder="node1, node2"
              disabled={loading}
            />
            <p className="text-muted-foreground text-[10px]">
              Comma-separated K8s node names to exclude from scheduling
            </p>
          </div>

          {/* Aerospike Config */}
          <div className="grid gap-2">
            <Label htmlFor="edit-aerospike-config">Aerospike Config (JSON)</Label>
            <Textarea
              id="edit-aerospike-config"
              value={aerospikeConfigText}
              onChange={(e) => {
                setAerospikeConfigText(e.target.value);
                setError(null);
              }}
              rows={12}
              className="font-mono text-xs"
              placeholder='{"service": {...}, "network": {...}, "namespaces": [...]}'
              disabled={loading}
            />
            {configError && <p className="text-destructive text-sm">{configError}</p>}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <LoadingButton
            onClick={handleSave}
            loading={loading}
            disabled={!hasChanges || loading || !!configError}
          >
            Save Changes
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

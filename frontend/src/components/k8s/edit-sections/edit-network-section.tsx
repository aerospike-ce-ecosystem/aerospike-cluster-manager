"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import type { NetworkAccessType, NetworkPolicyAutoConfig } from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Network Policy Section for Edit Dialog
// ---------------------------------------------------------------------------

export function EditNetworkSection({
  accessType,
  fabricType,
  alternateAccessType,
  customAccessNames,
  customAltAccessNames,
  customFabricNames,
  networkPolicyConfig,
  disabled,
  onAccessTypeChange,
  onFabricTypeChange,
  onAlternateAccessTypeChange,
  onCustomAccessNamesChange,
  onCustomAltAccessNamesChange,
  onCustomFabricNamesChange,
  onNetworkPolicyConfigChange,
}: {
  accessType: NetworkAccessType;
  fabricType: NetworkAccessType | "";
  alternateAccessType: NetworkAccessType | "";
  customAccessNames: string;
  customAltAccessNames: string;
  customFabricNames: string;
  networkPolicyConfig: NetworkPolicyAutoConfig | null;
  disabled?: boolean;
  onAccessTypeChange: (v: NetworkAccessType) => void;
  onFabricTypeChange: (v: NetworkAccessType | "") => void;
  onAlternateAccessTypeChange: (v: NetworkAccessType | "") => void;
  onCustomAccessNamesChange: (v: string) => void;
  onCustomAltAccessNamesChange: (v: string) => void;
  onCustomFabricNamesChange: (v: string) => void;
  onNetworkPolicyConfigChange: (v: NetworkPolicyAutoConfig | null) => void;
}) {
  return (
    <>
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
              onChange={(e) => {
                onAccessTypeChange(e.target.value as NetworkAccessType);
              }}
              id="edit-access-type"
              disabled={disabled}
            >
              <option value="pod">Pod IP</option>
              <option value="hostInternal">Host Internal</option>
              <option value="hostExternal">Host External</option>
              <option value="configuredIP">Configured IP</option>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="edit-fabric-type" className="text-xs">
              Fabric Type
            </Label>
            <Select
              value={fabricType || "default"}
              onChange={(e) => {
                const v = e.target.value;
                onFabricTypeChange(v === "default" ? "" : (v as NetworkAccessType));
              }}
              id="edit-fabric-type"
              disabled={disabled}
            >
              <option value="default">Default (same as access)</option>
              <option value="pod">Pod IP</option>
              <option value="hostInternal">Host Internal</option>
              <option value="hostExternal">Host External</option>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="edit-alt-access" className="text-xs">
              Alternate Access
            </Label>
            <Select
              value={alternateAccessType || "default"}
              onChange={(e) => {
                const v = e.target.value;
                onAlternateAccessTypeChange(v === "default" ? "" : (v as NetworkAccessType));
              }}
              id="edit-alt-access"
              disabled={disabled}
            >
              <option value="default">None</option>
              <option value="pod">Pod IP</option>
              <option value="hostInternal">Host Internal</option>
              <option value="hostExternal">Host External</option>
              <option value="configuredIP">Configured IP</option>
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
                onChange={(e) => onCustomAccessNamesChange(e.target.value)}
                placeholder="networkName1, networkName2"
                disabled={disabled}
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
                onChange={(e) => onCustomAltAccessNamesChange(e.target.value)}
                placeholder="networkName1, networkName2"
                disabled={disabled}
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
                onChange={(e) => onCustomFabricNamesChange(e.target.value)}
                placeholder="networkName1, networkName2"
                disabled={disabled}
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
                onNetworkPolicyConfigChange({ enabled: true, type: "kubernetes" });
              } else {
                onNetworkPolicyConfigChange(null);
              }
            }}
            disabled={disabled}
          />
          <Label htmlFor="edit-netpol-auto" className="cursor-pointer text-xs">
            Auto-generate K8s NetworkPolicy
          </Label>
        </div>
        {networkPolicyConfig?.enabled && (
          <Select
            value={networkPolicyConfig.type}
            onChange={(e) => {
              onNetworkPolicyConfigChange({
                enabled: true,
                type: e.target.value as "kubernetes" | "cilium",
              });
            }}
            disabled={disabled}
          >
            <option value="kubernetes">Kubernetes (standard)</option>
            <option value="cilium">Cilium</option>
          </Select>
        )}
      </div>
    </>
  );
}

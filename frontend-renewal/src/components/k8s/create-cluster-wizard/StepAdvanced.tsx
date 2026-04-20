"use client";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { Input } from "@/components/Input";
import { Label } from "@/components/Label";
import type {
  ACLConfig,
  ACLRoleSpec,
  ACLUserSpec,
  BandwidthConfig,
  CreateK8sClusterRequest,
  NetworkAccessConfig,
  PodMetadataConfig,
  PodSchedulingConfig,
  RackConfig,
  ServiceMetadataConfig,
  SidecarConfig,
  TolerationConfig,
  ValidationPolicyConfig,
} from "@/lib/types/k8s";

import { ChipListEditor, KeyValueEditor, Section } from "./shared";

interface StepAdvancedProps {
  form: CreateK8sClusterRequest;
  updateForm: (updates: Partial<CreateK8sClusterRequest>) => void;
}

export function StepAdvanced({ form, updateForm }: StepAdvancedProps) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Advanced</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Optional settings with sensible defaults. Expand only what you need.
        </p>
      </div>

      <MonitoringSection form={form} updateForm={updateForm} />
      <AclSection form={form} updateForm={updateForm} />
      <RollingUpdateSection form={form} updateForm={updateForm} />
      <RackConfigSection form={form} updateForm={updateForm} />
      <PodSettingsSection form={form} updateForm={updateForm} />
      <SidecarsSection form={form} updateForm={updateForm} />
      <NetworkPolicySection form={form} updateForm={updateForm} />
      <NodeBlockListSection form={form} updateForm={updateForm} />
      <BandwidthSection form={form} updateForm={updateForm} />
      <ValidationPolicySection form={form} updateForm={updateForm} />
      <ServiceMetadataSection form={form} updateForm={updateForm} />
      <RackIDOverrideSection form={form} updateForm={updateForm} />
      <DynamicConfigSection form={form} updateForm={updateForm} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

function MonitoringSection({ form, updateForm }: StepAdvancedProps) {
  const monitoring = form.monitoring ?? { enabled: false, port: 9145 };
  const enabled = Boolean(monitoring.enabled);
  const summary = enabled ? `Enabled (port ${monitoring.port ?? 9145})` : "Disabled";

  return (
    <Section title="Monitoring (Prometheus exporter)" summary={summary}>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2">
          <Checkbox
            id="mon-enabled"
            checked={enabled}
            onCheckedChange={(v) =>
              updateForm({ monitoring: { ...monitoring, enabled: v === true } })
            }
          />
          <Label htmlFor="mon-enabled" className="cursor-pointer">
            Enable Prometheus exporter sidecar
          </Label>
        </label>
        {enabled && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mon-port">Exporter Port</Label>
              <Input
                id="mon-port"
                type="number"
                min={1}
                max={65535}
                value={String(monitoring.port ?? 9145)}
                onChange={(e) =>
                  updateForm({
                    monitoring: {
                      ...monitoring,
                      port: Number.parseInt(e.target.value, 10) || 9145,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mon-image">Exporter Image (optional)</Label>
              <Input
                id="mon-image"
                value={monitoring.exporterImage ?? ""}
                onChange={(e) =>
                  updateForm({ monitoring: { ...monitoring, exporterImage: e.target.value } })
                }
                placeholder="aerospike/aerospike-prometheus-exporter:latest"
              />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// ACL
// ---------------------------------------------------------------------------

function AclSection({ form, updateForm }: StepAdvancedProps) {
  const acl: ACLConfig = form.acl ?? { enabled: false, roles: [], users: [] };
  const enabled = Boolean(acl.enabled);
  const summary = enabled
    ? `${acl.users?.length ?? 0} user(s), ${acl.roles?.length ?? 0} role(s)`
    : "Disabled";

  const set = (patch: Partial<ACLConfig>) => updateForm({ acl: { ...acl, ...patch } });

  const addRole = () => {
    const role: ACLRoleSpec = { name: "", privileges: [], whitelist: null };
    set({ roles: [...(acl.roles ?? []), role] });
  };
  const updateRole = (i: number, patch: Partial<ACLRoleSpec>) => {
    const roles = (acl.roles ?? []).map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    set({ roles });
  };
  const removeRole = (i: number) =>
    set({ roles: (acl.roles ?? []).filter((_, idx) => idx !== i) });

  const addUser = () => {
    const user: ACLUserSpec = { name: "", secretName: "", roles: [] };
    set({ users: [...(acl.users ?? []), user] });
  };
  const updateUser = (i: number, patch: Partial<ACLUserSpec>) => {
    const users = (acl.users ?? []).map((u, idx) => (idx === i ? { ...u, ...patch } : u));
    set({ users });
  };
  const removeUser = (i: number) =>
    set({ users: (acl.users ?? []).filter((_, idx) => idx !== i) });

  return (
    <Section title="Security (ACL)" summary={summary}>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2">
          <Checkbox
            id="acl-enabled"
            checked={enabled}
            onCheckedChange={(v) => set({ enabled: v === true })}
          />
          <Label htmlFor="acl-enabled" className="cursor-pointer">
            Enable ACL (users & roles)
          </Label>
        </label>

        {enabled && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acl-timeout">Admin Policy Timeout (seconds)</Label>
              <Input
                id="acl-timeout"
                type="number"
                min={1}
                value={String(acl.adminPolicyTimeout ?? 30)}
                onChange={(e) =>
                  set({ adminPolicyTimeout: Number.parseInt(e.target.value, 10) || 30 })
                }
                className="md:w-60"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Roles</h4>
                <Button type="button" variant="secondary" onClick={addRole}>
                  + Add role
                </Button>
              </div>
              {(acl.roles ?? []).map((role, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Role {i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeRole(i)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`role-name-${i}`}>Name</Label>
                      <Input
                        id={`role-name-${i}`}
                        value={role.name}
                        onChange={(e) => updateRole(i, { name: e.target.value })}
                        placeholder="admin"
                      />
                    </div>
                  </div>
                  <ChipListEditor
                    label="Privileges"
                    value={role.privileges ?? []}
                    onChange={(next) => updateRole(i, { privileges: next ?? [] })}
                    placeholder="read-write-udf"
                  />
                  <ChipListEditor
                    label="Whitelist (IPs/CIDRs, optional)"
                    value={role.whitelist ?? []}
                    onChange={(next) => updateRole(i, { whitelist: next })}
                    placeholder="10.0.0.0/8"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Users</h4>
                <Button type="button" variant="secondary" onClick={addUser}>
                  + Add user
                </Button>
              </div>
              {(acl.users ?? []).map((user, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">User {i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => removeUser(i)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`user-name-${i}`}>Username</Label>
                      <Input
                        id={`user-name-${i}`}
                        value={user.name}
                        onChange={(e) => updateUser(i, { name: e.target.value })}
                        placeholder="admin"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`user-secret-${i}`}>K8s Secret Name (password)</Label>
                      <Input
                        id={`user-secret-${i}`}
                        value={user.secretName}
                        onChange={(e) => updateUser(i, { secretName: e.target.value })}
                        placeholder="aerospike-admin-password"
                      />
                    </div>
                  </div>
                  <ChipListEditor
                    label="Assigned roles"
                    value={user.roles ?? []}
                    onChange={(next) => updateUser(i, { roles: next ?? [] })}
                    placeholder="admin"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rolling Update
// ---------------------------------------------------------------------------

function RollingUpdateSection({ form, updateForm }: StepAdvancedProps) {
  const ru = form.rollingUpdate ?? {};
  const active =
    ru.batchSize !== undefined || ru.maxUnavailable !== undefined || Boolean(ru.disablePDB);
  return (
    <Section title="Rolling Update" summary={active ? "Customized" : "Default"}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ru-batch">Batch Size</Label>
          <Input
            id="ru-batch"
            type="number"
            min={1}
            value={ru.batchSize === undefined ? "" : String(ru.batchSize)}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              updateForm({
                rollingUpdate: {
                  ...ru,
                  batchSize: Number.isFinite(n) ? n : undefined,
                },
              });
            }}
            placeholder="default"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ru-max-unavailable">Max Unavailable</Label>
          <Input
            id="ru-max-unavailable"
            value={String(ru.maxUnavailable ?? "")}
            onChange={(e) =>
              updateForm({
                rollingUpdate: { ...ru, maxUnavailable: e.target.value || undefined },
              })
            }
            placeholder="30% or 1"
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id="ru-disable-pdb"
            checked={Boolean(ru.disablePDB)}
            onCheckedChange={(v) =>
              updateForm({ rollingUpdate: { ...ru, disablePDB: v === true } })
            }
          />
          <Label htmlFor="ru-disable-pdb" className="cursor-pointer">
            Disable PodDisruptionBudget
          </Label>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rack Config
// ---------------------------------------------------------------------------

function RackConfigSection({ form, updateForm }: StepAdvancedProps) {
  const rc = form.rackConfig ?? { racks: [] };
  const racks = rc.racks ?? [];
  const summary = racks.length > 0 ? `${racks.length} rack(s)` : "Single rack";

  const set = (patch: Partial<typeof rc>) =>
    updateForm({ rackConfig: { ...rc, ...patch } });

  const addRack = () => {
    const nextId = (racks.reduce((max, r) => Math.max(max, r.id ?? 0), 0) || 0) + 1;
    const rack: RackConfig = { id: nextId };
    set({ racks: [...racks, rack] });
  };

  const updateRack = (i: number, patch: Partial<RackConfig>) => {
    set({
      racks: racks.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    });
  };

  const removeRack = (i: number) =>
    set({ racks: racks.filter((_, idx) => idx !== i) });

  return (
    <Section title="Rack Config" summary={summary}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-scale-down">Scale-down Batch Size</Label>
            <Input
              id="rc-scale-down"
              value={rc.scaleDownBatchSize ?? ""}
              onChange={(e) =>
                set({ scaleDownBatchSize: e.target.value || null })
              }
              placeholder="1"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-max-ignorable">Max Ignorable Pods</Label>
            <Input
              id="rc-max-ignorable"
              value={rc.maxIgnorablePods ?? ""}
              onChange={(e) =>
                set({ maxIgnorablePods: e.target.value || null })
              }
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-rolling-batch">Rolling Update Batch Size</Label>
            <Input
              id="rc-rolling-batch"
              value={rc.rollingUpdateBatchSize ?? ""}
              onChange={(e) =>
                set({ rollingUpdateBatchSize: e.target.value || null })
              }
              placeholder="1"
            />
          </div>
        </div>

        <ChipListEditor
          label="Scope to specific namespaces (optional)"
          value={rc.namespaces ?? []}
          onChange={(next) => set({ namespaces: next })}
          placeholder="test"
        />

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Racks</h4>
          <Button type="button" variant="secondary" onClick={addRack}>
            + Add rack
          </Button>
        </div>

        {racks.length === 0 && (
          <p className="text-xs text-gray-500">
            No racks defined — the cluster will run as a single rack.
          </p>
        )}

        {racks.map((rack, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Rack {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeRack(i)}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rack-id-${i}`}>ID</Label>
                <Input
                  id={`rack-id-${i}`}
                  type="number"
                  min={1}
                  value={String(rack.id)}
                  onChange={(e) =>
                    updateRack(i, { id: Number.parseInt(e.target.value, 10) || 1 })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rack-zone-${i}`}>Zone</Label>
                <Input
                  id={`rack-zone-${i}`}
                  value={rack.zone ?? ""}
                  onChange={(e) => updateRack(i, { zone: e.target.value || null })}
                  placeholder="us-west-2a"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rack-region-${i}`}>Region</Label>
                <Input
                  id={`rack-region-${i}`}
                  value={rack.region ?? ""}
                  onChange={(e) => updateRack(i, { region: e.target.value || null })}
                  placeholder="us-west-2"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`rack-label-${i}`}>Rack Label</Label>
                <Input
                  id={`rack-label-${i}`}
                  value={rack.rackLabel ?? ""}
                  onChange={(e) => updateRack(i, { rackLabel: e.target.value || null })}
                  placeholder="custom-label"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Pod Settings
// ---------------------------------------------------------------------------

function PodSettingsSection({ form, updateForm }: StepAdvancedProps) {
  const ps: PodSchedulingConfig = form.podScheduling ?? {};
  const meta: PodMetadataConfig = ps.metadata ?? { labels: null, annotations: null };
  const set = (patch: Partial<PodSchedulingConfig>) =>
    updateForm({ podScheduling: { ...ps, ...patch } });

  const changed =
    Boolean(ps.nodeSelector && Object.keys(ps.nodeSelector).length) ||
    Boolean(ps.tolerations?.length) ||
    Boolean(ps.multiPodPerHost) ||
    Boolean(ps.hostNetwork) ||
    Boolean(ps.serviceAccountName) ||
    ps.readinessGateEnabled !== undefined ||
    ps.podManagementPolicy !== undefined ||
    Boolean(meta.labels && Object.keys(meta.labels).length) ||
    Boolean(meta.annotations && Object.keys(meta.annotations).length);

  const tolerations = ps.tolerations ?? [];
  const addToleration = () => {
    const t: TolerationConfig = { key: "", operator: "Equal", value: "", effect: "NoSchedule" };
    set({ tolerations: [...tolerations, t] });
  };
  const updateToleration = (i: number, patch: Partial<TolerationConfig>) =>
    set({
      tolerations: tolerations.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    });
  const removeToleration = (i: number) =>
    set({ tolerations: tolerations.filter((_, idx) => idx !== i) });

  return (
    <Section title="Pod Settings" summary={changed ? "Customized" : "Default"}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ps-sa">Service Account Name</Label>
            <Input
              id="ps-sa"
              value={ps.serviceAccountName ?? ""}
              onChange={(e) => set({ serviceAccountName: e.target.value || null })}
              placeholder="aerospike-cluster"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ps-pmp">Pod Management Policy</Label>
            <select
              id="ps-pmp"
              value={ps.podManagementPolicy ?? ""}
              onChange={(e) =>
                set({
                  podManagementPolicy:
                    (e.target.value as PodSchedulingConfig["podManagementPolicy"]) || null,
                })
              }
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Default (OrderedReady)</option>
              <option value="OrderedReady">OrderedReady</option>
              <option value="Parallel">Parallel</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <Checkbox
              id="ps-multi"
              checked={Boolean(ps.multiPodPerHost)}
              onCheckedChange={(v) => set({ multiPodPerHost: v === true })}
            />
            <Label htmlFor="ps-multi" className="cursor-pointer">
              Multi Pod Per Host
            </Label>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              id="ps-hostnet"
              checked={Boolean(ps.hostNetwork)}
              onCheckedChange={(v) => set({ hostNetwork: v === true })}
            />
            <Label htmlFor="ps-hostnet" className="cursor-pointer">
              Host Network
            </Label>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              id="ps-readiness"
              checked={Boolean(ps.readinessGateEnabled)}
              onCheckedChange={(v) => set({ readinessGateEnabled: v === true })}
            />
            <Label htmlFor="ps-readiness" className="cursor-pointer">
              Enable Readiness Gate
            </Label>
          </label>
        </div>

        <KeyValueEditor
          label="Node Selector"
          value={ps.nodeSelector}
          onChange={(next) => set({ nodeSelector: next })}
          keyPlaceholder="disktype"
          valuePlaceholder="ssd"
        />

        <KeyValueEditor
          label="Pod Labels"
          value={meta.labels ?? null}
          onChange={(next) => set({ metadata: { ...meta, labels: next } })}
        />
        <KeyValueEditor
          label="Pod Annotations"
          value={meta.annotations ?? null}
          onChange={(next) => set({ metadata: { ...meta, annotations: next } })}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Tolerations</div>
            <Button type="button" variant="secondary" onClick={addToleration}>
              + Add toleration
            </Button>
          </div>
          {tolerations.length === 0 && (
            <p className="text-xs text-gray-500">None.</p>
          )}
          {tolerations.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 p-3 md:grid-cols-5 dark:border-gray-800"
            >
              <Input
                value={t.key ?? ""}
                onChange={(e) => updateToleration(i, { key: e.target.value || null })}
                placeholder="key"
              />
              <select
                value={t.operator ?? "Equal"}
                onChange={(e) =>
                  updateToleration(i, {
                    operator: e.target.value as TolerationConfig["operator"],
                  })
                }
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="Equal">Equal</option>
                <option value="Exists">Exists</option>
              </select>
              <Input
                value={t.value ?? ""}
                onChange={(e) => updateToleration(i, { value: e.target.value || null })}
                placeholder="value"
              />
              <select
                value={t.effect ?? ""}
                onChange={(e) =>
                  updateToleration(i, {
                    effect: e.target.value as TolerationConfig["effect"],
                  })
                }
                className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">(any)</option>
                <option value="NoSchedule">NoSchedule</option>
                <option value="PreferNoSchedule">PreferNoSchedule</option>
                <option value="NoExecute">NoExecute</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeToleration(i)}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sidecars / Init Containers
// ---------------------------------------------------------------------------

function SidecarsSection({ form, updateForm }: StepAdvancedProps) {
  const summary =
    (form.sidecars?.length ?? 0) + (form.initContainers?.length ?? 0) > 0
      ? `${form.sidecars?.length ?? 0} sidecar(s), ${form.initContainers?.length ?? 0} init container(s)`
      : "None";

  return (
    <Section title="Sidecars & Init Containers" summary={summary}>
      <div className="flex flex-col gap-4">
        <ContainerList
          title="Sidecars"
          value={form.sidecars ?? []}
          onChange={(next) => updateForm({ sidecars: next.length ? next : undefined })}
        />
        <ContainerList
          title="Init Containers"
          value={form.initContainers ?? []}
          onChange={(next) => updateForm({ initContainers: next.length ? next : undefined })}
        />
      </div>
    </Section>
  );
}

function ContainerList({
  title,
  value,
  onChange,
}: {
  title: string;
  value: SidecarConfig[];
  onChange: (next: SidecarConfig[]) => void;
}) {
  const add = () => onChange([...value, { name: "", image: "" }]);
  const update = (i: number, patch: Partial<SidecarConfig>) =>
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</h4>
        <Button type="button" variant="secondary" onClick={add}>
          + Add
        </Button>
      </div>
      {value.length === 0 && <p className="text-xs text-gray-500">None.</p>}
      {value.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-3 md:grid-cols-2 dark:border-gray-800"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${title}-name-${i}`}>Name</Label>
            <Input
              id={`${title}-name-${i}`}
              value={c.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${title}-image-${i}`}>Image</Label>
            <Input
              id={`${title}-image-${i}`}
              value={c.image}
              onChange={(e) => update(i, { image: e.target.value })}
              placeholder="busybox:latest"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${title}-cmd-${i}`}>Command (comma-separated)</Label>
            <Input
              id={`${title}-cmd-${i}`}
              value={(c.command ?? []).join(",")}
              onChange={(e) =>
                update(i, {
                  command: e.target.value
                    ? e.target.value.split(",").map((s) => s.trim())
                    : null,
                })
              }
              placeholder="sh,-c"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${title}-args-${i}`}>Args (comma-separated)</Label>
            <Input
              id={`${title}-args-${i}`}
              value={(c.args ?? []).join(",")}
              onChange={(e) =>
                update(i, {
                  args: e.target.value ? e.target.value.split(",").map((s) => s.trim()) : null,
                })
              }
              placeholder="echo,hello"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => remove(i)}
              className="text-red-600 hover:text-red-700"
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Network Policy (access types)
// ---------------------------------------------------------------------------

function NetworkPolicySection({ form, updateForm }: StepAdvancedProps) {
  const np: NetworkAccessConfig = form.networkPolicy ?? { accessType: "pod" };
  const summary =
    np.accessType && np.accessType !== "pod" ? `access=${np.accessType}` : "Default (pod)";

  const set = (patch: Partial<NetworkAccessConfig>) =>
    updateForm({ networkPolicy: { ...np, ...patch } });

  return (
    <Section title="Network Policy" summary={summary}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-access">Access Type</Label>
          <select
            id="np-access"
            value={np.accessType ?? "pod"}
            onChange={(e) =>
              set({ accessType: e.target.value as NetworkAccessConfig["accessType"] })
            }
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="pod">pod</option>
            <option value="hostInternal">hostInternal</option>
            <option value="hostExternal">hostExternal</option>
            <option value="configuredIP">configuredIP</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-alt">Alternate Access Type</Label>
          <select
            id="np-alt"
            value={np.alternateAccessType ?? ""}
            onChange={(e) =>
              set({
                alternateAccessType:
                  (e.target.value as NetworkAccessConfig["alternateAccessType"]) || null,
              })
            }
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">(none)</option>
            <option value="pod">pod</option>
            <option value="hostInternal">hostInternal</option>
            <option value="hostExternal">hostExternal</option>
            <option value="configuredIP">configuredIP</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="np-fabric">Fabric Type</Label>
          <select
            id="np-fabric"
            value={np.fabricType ?? ""}
            onChange={(e) =>
              set({
                fabricType: (e.target.value as NetworkAccessConfig["fabricType"]) || null,
              })
            }
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">(none)</option>
            <option value="pod">pod</option>
            <option value="hostInternal">hostInternal</option>
            <option value="hostExternal">hostExternal</option>
            <option value="configuredIP">configuredIP</option>
          </select>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Node Block List
// ---------------------------------------------------------------------------

function NodeBlockListSection({ form, updateForm }: StepAdvancedProps) {
  const list = form.k8sNodeBlockList ?? [];
  return (
    <Section
      title="Node Block List"
      summary={list.length > 0 ? `${list.length} node(s) blocked` : "None"}
    >
      <ChipListEditor
        label="Node names"
        value={list}
        onChange={(next) => updateForm({ k8sNodeBlockList: next ?? null })}
        placeholder="kind-worker"
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Bandwidth
// ---------------------------------------------------------------------------

function BandwidthSection({ form, updateForm }: StepAdvancedProps) {
  const bw: BandwidthConfig = form.bandwidthConfig ?? {};
  const summary = bw.ingress || bw.egress ? "Limited" : "No limits";
  const set = (patch: Partial<BandwidthConfig>) =>
    updateForm({ bandwidthConfig: { ...bw, ...patch } });
  return (
    <Section title="Bandwidth Limits" summary={summary}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bw-ingress">Ingress</Label>
          <Input
            id="bw-ingress"
            value={bw.ingress ?? ""}
            onChange={(e) => set({ ingress: e.target.value || null })}
            placeholder="100M"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bw-egress">Egress</Label>
          <Input
            id="bw-egress"
            value={bw.egress ?? ""}
            onChange={(e) => set({ egress: e.target.value || null })}
            placeholder="100M"
          />
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Validation Policy
// ---------------------------------------------------------------------------

function ValidationPolicySection({ form, updateForm }: StepAdvancedProps) {
  const vp: ValidationPolicyConfig = form.validationPolicy ?? {};
  const summary = vp.skipWorkDirValidate ? "skipWorkDirValidate=true" : "Default";
  return (
    <Section title="Validation Policy" summary={summary}>
      <label className="flex items-center gap-2">
        <Checkbox
          id="vp-skip-workdir"
          checked={Boolean(vp.skipWorkDirValidate)}
          onCheckedChange={(v) =>
            updateForm({
              validationPolicy: { ...vp, skipWorkDirValidate: v === true },
            })
          }
        />
        <Label htmlFor="vp-skip-workdir" className="cursor-pointer">
          Skip work-dir validation
        </Label>
      </label>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Service Metadata (headless / pod)
// ---------------------------------------------------------------------------

function ServiceMetadataSection({ form, updateForm }: StepAdvancedProps) {
  const hs: ServiceMetadataConfig = form.headlessService ?? {};
  const ps: ServiceMetadataConfig = form.podService ?? {};
  const hsChanged =
    Boolean(hs.labels && Object.keys(hs.labels).length) ||
    Boolean(hs.annotations && Object.keys(hs.annotations).length);
  const psChanged =
    Boolean(ps.labels && Object.keys(ps.labels).length) ||
    Boolean(ps.annotations && Object.keys(ps.annotations).length);
  const summary = hsChanged || psChanged ? "Customized" : "Default";

  return (
    <Section title="Service Metadata" summary={summary}>
      <div className="flex flex-col gap-5">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">
            Headless Service
          </h4>
          <div className="flex flex-col gap-3">
            <KeyValueEditor
              label="Labels"
              value={hs.labels ?? null}
              onChange={(next) => updateForm({ headlessService: { ...hs, labels: next } })}
            />
            <KeyValueEditor
              label="Annotations"
              value={hs.annotations ?? null}
              onChange={(next) => updateForm({ headlessService: { ...hs, annotations: next } })}
            />
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">Pod Service</h4>
          <div className="flex flex-col gap-3">
            <KeyValueEditor
              label="Labels"
              value={ps.labels ?? null}
              onChange={(next) => updateForm({ podService: { ...ps, labels: next } })}
            />
            <KeyValueEditor
              label="Annotations"
              value={ps.annotations ?? null}
              onChange={(next) => updateForm({ podService: { ...ps, annotations: next } })}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rack ID Override
// ---------------------------------------------------------------------------

function RackIDOverrideSection({ form, updateForm }: StepAdvancedProps) {
  return (
    <Section
      title="Rack ID Override"
      summary={form.enableRackIDOverride ? "Enabled" : "Disabled"}
    >
      <label className="flex items-center gap-2">
        <Checkbox
          id="rack-id-override"
          checked={Boolean(form.enableRackIDOverride)}
          onCheckedChange={(v) => updateForm({ enableRackIDOverride: v === true })}
        />
        <Label htmlFor="rack-id-override" className="cursor-pointer">
          Allow overriding rack IDs at runtime
        </Label>
      </label>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Dynamic Config
// ---------------------------------------------------------------------------

function DynamicConfigSection({ form, updateForm }: StepAdvancedProps) {
  return (
    <Section
      title="Dynamic Aerospike Config"
      summary={form.enableDynamicConfig ? "Enabled" : "Disabled"}
    >
      <label className="flex items-center gap-2">
        <Checkbox
          id="dynamic-config"
          checked={Boolean(form.enableDynamicConfig)}
          onCheckedChange={(v) => updateForm({ enableDynamicConfig: v === true })}
        />
        <Label htmlFor="dynamic-config" className="cursor-pointer">
          Enable dynamic config (apply certain changes without restart)
        </Label>
      </label>
    </Section>
  );
}

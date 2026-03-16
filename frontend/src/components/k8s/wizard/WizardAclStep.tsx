import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/common/form-field";
import { AEROSPIKE_PRIVILEGES } from "@/lib/validations/k8s-acl";
import type { WizardAclStepProps } from "./types";

export function WizardAclStep({ form, updateForm, k8sSecrets }: WizardAclStepProps) {
  return (
    <>
      <div className="flex items-center space-x-2">
        <Checkbox
          id="acl-enabled"
          checked={form.acl?.enabled ?? false}
          onCheckedChange={(checked) => {
            if (checked === true) {
              updateForm({
                acl: {
                  enabled: true,
                  roles: [],
                  users: [],
                  adminPolicyTimeout: 2000,
                },
              });
            } else {
              updateForm({ acl: undefined });
            }
          }}
        />
        <Label htmlFor="acl-enabled" className="text-sm font-normal">
          Enable ACL (Access Control)
        </Label>
      </div>

      {form.acl?.enabled && (
        <div className="space-y-6 pt-2">
          <FormField id="admin-timeout" label="Admin Policy Timeout (ms)">
            <Input
              id="admin-timeout"
              type="number"
              min={100}
              max={30000}
              value={form.acl.adminPolicyTimeout}
              onChange={(e) =>
                updateForm({
                  acl: {
                    ...form.acl!,
                    adminPolicyTimeout: parseInt(e.target.value) || 2000,
                  },
                })
              }
            />
          </FormField>

          {/* Roles Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Roles</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateForm({
                    acl: {
                      ...form.acl!,
                      roles: [...form.acl!.roles, { name: "", privileges: [], whitelist: [] }],
                    },
                  })
                }
              >
                Add Role
              </Button>
            </div>
            {form.acl.roles.map((role, ri) => (
              <div
                key={`role-${ri}-${role.name || ri}`}
                className="space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Role name"
                    value={role.name}
                    onChange={(e) => {
                      const roles = [...form.acl!.roles];
                      roles[ri] = { ...roles[ri], name: e.target.value };
                      updateForm({ acl: { ...form.acl!, roles } });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const roles = form.acl!.roles.filter((_, i) => i !== ri);
                      updateForm({ acl: { ...form.acl!, roles } });
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-xs">Privileges</Label>
                  <div className="flex flex-wrap gap-2">
                    {AEROSPIKE_PRIVILEGES.map((priv) => (
                      <label key={priv} className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={role.privileges.includes(priv)}
                          onCheckedChange={(checked) => {
                            const roles = [...form.acl!.roles];
                            const privileges = checked
                              ? [...roles[ri].privileges, priv]
                              : roles[ri].privileges.filter((p) => p !== priv);
                            roles[ri] = { ...roles[ri], privileges };
                            updateForm({ acl: { ...form.acl!, roles } });
                          }}
                        />
                        {priv}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-xs">
                    Whitelist CIDRs (comma-separated, optional)
                  </Label>
                  <Input
                    placeholder="e.g. 10.0.0.0/8, 192.168.1.0/24"
                    value={role.whitelist?.join(", ") ?? ""}
                    onChange={(e) => {
                      const roles = [...form.acl!.roles];
                      const raw = e.target.value;
                      roles[ri] = {
                        ...roles[ri],
                        whitelist: raw
                          ? raw
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : [],
                      };
                      updateForm({ acl: { ...form.acl!, roles } });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Users Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Users</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateForm({
                    acl: {
                      ...form.acl!,
                      users: [...form.acl!.users, { name: "", secretName: "", roles: [] }],
                    },
                  })
                }
              >
                Add User
              </Button>
            </div>
            {form.acl.users.map((user, ui) => (
              <div
                key={`user-${ui}-${user.name || ui}`}
                className="space-y-2 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Username"
                    value={user.name}
                    onChange={(e) => {
                      const users = [...form.acl!.users];
                      users[ui] = { ...users[ui], name: e.target.value };
                      updateForm({ acl: { ...form.acl!, users } });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const users = form.acl!.users.filter((_, i) => i !== ui);
                      updateForm({ acl: { ...form.acl!, users } });
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-xs">K8s Secret Name (password)</Label>
                  {k8sSecrets.length > 0 ? (
                    <Select
                      value={user.secretName || "__none__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        const users = [...form.acl!.users];
                        users[ui] = {
                          ...users[ui],
                          secretName: v === "__none__" ? "" : v,
                        };
                        updateForm({ acl: { ...form.acl!, users } });
                      }}
                    >
                      <option value="__none__">Select a secret...</option>
                      {k8sSecrets.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      placeholder="my-aerospike-secret"
                      value={user.secretName}
                      onChange={(e) => {
                        const users = [...form.acl!.users];
                        users[ui] = { ...users[ui], secretName: e.target.value };
                        updateForm({ acl: { ...form.acl!, users } });
                      }}
                    />
                  )}
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-xs">Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...AEROSPIKE_PRIVILEGES.map((p) => p as string),
                      ...form.acl!.roles.map((r) => r.name).filter(Boolean),
                    ]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((roleName) => (
                        <label key={roleName} className="flex items-center gap-1 text-xs">
                          <Checkbox
                            checked={user.roles.includes(roleName)}
                            onCheckedChange={(checked) => {
                              const users = [...form.acl!.users];
                              const roles = checked
                                ? [...users[ui].roles, roleName]
                                : users[ui].roles.filter((r) => r !== roleName);
                              users[ui] = { ...users[ui], roles };
                              updateForm({ acl: { ...form.acl!, users } });
                            }}
                          />
                          {roleName}
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

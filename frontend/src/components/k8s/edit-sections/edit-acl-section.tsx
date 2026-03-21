"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AEROSPIKE_PRIVILEGES } from "@/lib/validations/k8s-acl";
import type { ACLConfig, ACLRoleSpec, ACLUserSpec } from "@/lib/api/types";

interface EditAclSectionProps {
  acl: ACLConfig | null;
  onChange: (acl: ACLConfig | null) => void;
  disabled?: boolean;
}

export function EditAclSection({ acl, onChange, disabled }: EditAclSectionProps) {
  const updateAcl = (updates: Partial<ACLConfig>) => {
    if (!acl) return;
    onChange({ ...acl, ...updates });
  };

  const updateRole = (index: number, updates: Partial<ACLRoleSpec>) => {
    if (!acl) return;
    const roles = [...acl.roles];
    roles[index] = { ...roles[index], ...updates };
    updateAcl({ roles });
  };

  const updateUser = (index: number, updates: Partial<ACLUserSpec>) => {
    if (!acl) return;
    const users = [...acl.users];
    users[index] = { ...users[index], ...updates };
    updateAcl({ users });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="edit-acl-enabled"
          checked={acl?.enabled ?? false}
          onCheckedChange={(checked) => {
            if (checked === true) {
              onChange({
                enabled: true,
                roles: acl?.roles ?? [],
                users: acl?.users ?? [],
                adminPolicyTimeout: acl?.adminPolicyTimeout ?? 2000,
              });
            } else {
              onChange(null);
            }
          }}
          disabled={disabled}
        />
        <Label htmlFor="edit-acl-enabled" className="cursor-pointer text-xs">
          Enable ACL (Access Control)
        </Label>
      </div>

      {acl?.enabled && (
        <div className="space-y-4 pt-1">
          <div className="grid gap-1">
            <Label htmlFor="edit-acl-timeout" className="text-xs">
              Admin Policy Timeout (ms)
            </Label>
            <Input
              id="edit-acl-timeout"
              type="number"
              min={100}
              max={30000}
              value={acl.adminPolicyTimeout}
              onChange={(e) => updateAcl({ adminPolicyTimeout: parseInt(e.target.value) || 2000 })}
              disabled={disabled}
            />
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Roles</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateAcl({ roles: [...acl.roles, { name: "", privileges: [], whitelist: [] }] })
                }
                disabled={disabled}
              >
                Add Role
              </Button>
            </div>
            {acl.roles.map((role, ri) => (
              <div key={`edit-role-${ri}`} className="space-y-2 rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Role name"
                    value={role.name}
                    onChange={(e) => updateRole(ri, { name: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateAcl({ roles: acl.roles.filter((_, i) => i !== ri) })}
                    disabled={disabled}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-[10px]">Privileges</Label>
                  <div className="flex flex-wrap gap-2">
                    {AEROSPIKE_PRIVILEGES.map((priv) => (
                      <label key={priv} className="flex items-center gap-1 text-[10px]">
                        <Checkbox
                          checked={role.privileges.includes(priv)}
                          onCheckedChange={(checked) => {
                            const privileges = checked
                              ? [...role.privileges, priv]
                              : role.privileges.filter((p) => p !== priv);
                            updateRole(ri, { privileges });
                          }}
                          disabled={disabled}
                        />
                        {priv}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-[10px]">
                    Whitelist CIDRs (comma-separated)
                  </Label>
                  <Input
                    placeholder="e.g. 10.0.0.0/8, 192.168.1.0/24"
                    value={role.whitelist?.join(", ") ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateRole(ri, {
                        whitelist: raw
                          ? raw
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)
                          : [],
                      });
                    }}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Users */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Users</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateAcl({ users: [...acl.users, { name: "", secretName: "", roles: [] }] })
                }
                disabled={disabled}
              >
                Add User
              </Button>
            </div>
            {acl.users.map((user, ui) => (
              <div key={`edit-user-${ui}`} className="space-y-2 rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Username"
                    value={user.name}
                    onChange={(e) => updateUser(ui, { name: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateAcl({ users: acl.users.filter((_, i) => i !== ui) })}
                    disabled={disabled}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-[10px]">
                    K8s Secret Name (password)
                  </Label>
                  <Input
                    placeholder="my-aerospike-secret"
                    value={user.secretName}
                    onChange={(e) => updateUser(ui, { secretName: e.target.value })}
                    disabled={disabled}
                    className="text-xs"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-base-content/60 text-[10px]">Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...AEROSPIKE_PRIVILEGES.map((p) => p as string),
                      ...acl.roles.map((r) => r.name).filter(Boolean),
                    ]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((roleName) => (
                        <label key={roleName} className="flex items-center gap-1 text-[10px]">
                          <Checkbox
                            checked={user.roles.includes(roleName)}
                            onCheckedChange={(checked) => {
                              const roles = checked
                                ? [...user.roles, roleName]
                                : user.roles.filter((r) => r !== roleName);
                              updateUser(ui, { roles });
                            }}
                            disabled={disabled}
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
    </div>
  );
}

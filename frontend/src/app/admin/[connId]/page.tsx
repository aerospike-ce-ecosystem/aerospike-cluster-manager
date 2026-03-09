"use client";

import { use, useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Key, Shield, ShieldOff, Users, RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { InlineAlert } from "@/components/common/inline-alert";
import { LoadingButton } from "@/components/common/loading-button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { useAdminStore } from "@/stores/admin-store";
import type { AerospikeUser, AerospikeRole, Privilege } from "@/lib/api/types";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

const AVAILABLE_PRIVILEGES = [
  "read",
  "write",
  "read-write",
  "read-write-udf",
  "sys-admin",
  "user-admin",
  "data-admin",
];

export default function AdminPage({ params }: { params: Promise<{ connId: string }> }) {
  const { connId } = use(params);
  const {
    users,
    roles,
    usersLoading,
    rolesLoading,
    error,
    isSecurityDisabled,
    fetchUsers,
    fetchRoles,
    createUser,
    changePassword,
    deleteUser,
    createRole,
    deleteRole,
  } = useAdminStore();

  // Create User dialog
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<string[]>([]);
  const [creatingUser, setCreatingUser] = useState(false);

  // Change Password dialog
  const [changePassOpen, setChangePassOpen] = useState(false);
  const [changePassUser, setChangePassUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [changingPass, setChangingPass] = useState(false);

  // Delete User
  const [deleteUserTarget, setDeleteUserTarget] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Create Role dialog
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePrivileges, setNewRolePrivileges] = useState<string[]>([]);
  const [newRoleWhitelist, setNewRoleWhitelist] = useState("");
  const [newRoleReadQuota, setNewRoleReadQuota] = useState("0");
  const [newRoleWriteQuota, setNewRoleWriteQuota] = useState("0");
  const [creatingRole, setCreatingRole] = useState(false);

  // Delete Role
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<string | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  useEffect(() => {
    fetchUsers(connId);
    fetchRoles(connId);
  }, [connId, fetchUsers, fetchRoles]);

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast.error("Username and password are required");
      return;
    }
    setCreatingUser(true);
    try {
      await createUser(connId, {
        username: newUsername.trim(),
        password: newPassword,
        roles: newUserRoles,
      });
      toast.success("User created");
      setCreateUserOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewUserRoles([]);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      await deleteUser(connId, deleteUserTarget);
      toast.success("User deleted");
      setDeleteUserTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeletingUser(false);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    setCreatingRole(true);
    try {
      const privileges: Privilege[] = newRolePrivileges.map((code) => ({
        code,
      }));
      const whitelist = newRoleWhitelist
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await createRole(connId, {
        name: newRoleName.trim(),
        privileges,
        whitelist: whitelist.length > 0 ? whitelist : undefined,
        readQuota: parseInt(newRoleReadQuota, 10) || 0,
        writeQuota: parseInt(newRoleWriteQuota, 10) || 0,
      });
      toast.success("Role created");
      setCreateRoleOpen(false);
      setNewRoleName("");
      setNewRolePrivileges([]);
      setNewRoleWhitelist("");
      setNewRoleReadQuota("0");
      setNewRoleWriteQuota("0");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setCreatingRole(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    setDeletingRole(true);
    try {
      await deleteRole(connId, deleteRoleTarget);
      toast.success("Role deleted");
      setDeleteRoleTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDeletingRole(false);
    }
  };

  const toggleUserRole = useCallback((role: string) => {
    setNewUserRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }, []);

  const toggleRolePrivilege = useCallback((priv: string) => {
    setNewRolePrivileges((prev) =>
      prev.includes(priv) ? prev.filter((p) => p !== priv) : [...prev, priv],
    );
  }, []);

  const handleRefresh = useCallback(() => {
    fetchUsers(connId);
    fetchRoles(connId);
  }, [connId, fetchUsers, fetchRoles]);

  const userColumns = useMemo<ColumnDef<AerospikeUser>[]>(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
        meta: { mobileSlot: "title", mobileLabel: "User" },
      },
      {
        accessorKey: "roles",
        header: "Roles",
        cell: ({ getValue }) => {
          const userRoles = getValue() as string[];
          return (
            <div className="flex flex-wrap gap-1">
              {userRoles.map((role) => (
                <Badge key={role} variant="secondary" className="text-xs">
                  {role}
                </Badge>
              ))}
              {userRoles.length === 0 && (
                <span className="text-muted-foreground text-sm italic">No roles</span>
              )}
            </div>
          );
        },
        meta: { mobileSlot: "content" },
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={`Change password for ${row.original.username}`}
              onClick={() => {
                setChangePassUser(row.original.username);
                setNewPass("");
                setChangePassOpen(true);
              }}
            >
              <Key className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive h-8 w-8 p-0"
              aria-label={`Delete user ${row.original.username}`}
              onClick={() => setDeleteUserTarget(row.original.username)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        meta: { mobileSlot: "actions" },
      },
    ],
    [],
  );

  const roleColumns = useMemo<ColumnDef<AerospikeRole>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Role Name",
        cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
        meta: { mobileSlot: "title", mobileLabel: "Role" },
      },
      {
        accessorKey: "privileges",
        header: "Privileges",
        cell: ({ getValue }) => {
          const privs = getValue() as Privilege[];
          return (
            <div className="flex flex-wrap gap-1">
              {privs.map((priv, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {priv.code}
                  {priv.namespace && `.${priv.namespace}`}
                  {priv.set && `.${priv.set}`}
                </Badge>
              ))}
            </div>
          );
        },
        meta: { mobileSlot: "content" },
      },
      {
        accessorKey: "whitelist",
        header: "Whitelist",
        cell: ({ getValue }) => {
          const wl = getValue() as string[];
          return wl.length > 0 ? (
            <span className="font-mono text-xs">{wl.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground text-xs italic">any</span>
          );
        },
        meta: { hideOn: ["mobile"], mobileSlot: "content", mobileLabel: "Whitelist" },
      },
      {
        id: "quotas",
        header: "Quotas",
        cell: ({ row }) => (
          <div className="space-y-0.5 text-xs">
            <div>R: {row.original.readQuota}</div>
            <div>W: {row.original.writeQuota}</div>
          </div>
        ),
        meta: { hideOn: ["mobile"], mobileSlot: "meta", mobileLabel: "Quotas" },
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive h-8 w-8 p-0"
            aria-label={`Delete role ${row.original.name}`}
            onClick={() => setDeleteRoleTarget(row.original.name)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
        meta: { mobileSlot: "actions" },
      },
    ],
    [],
  );

  return (
    <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Administration"
        description="Manage users and roles"
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <InlineAlert message={error} />

      {isSecurityDisabled ? (
        <div className="border-warning/30 bg-warning/5 flex flex-col items-center justify-center rounded-lg border p-12 text-center">
          <ShieldOff className="text-warning mb-4 h-12 w-12" />
          <h3 className="text-lg font-semibold">Security Not Enabled</h3>
          <p className="text-muted-foreground mt-2 max-w-md">
            User and role management requires security to be enabled. Add a{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">security {"{ }"}</code>{" "}
            block to your{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">aerospike.conf</code>{" "}
            to enable this feature.
          </p>
        </div>
      ) : (
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              Users ({users.length})
            </TabsTrigger>
            <TabsTrigger value="roles">
              <Shield className="mr-2 h-4 w-4" />
              Roles ({roles.length})
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateUserOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </div>
            <DataTable
              data={users}
              columns={userColumns}
              loading={usersLoading}
              emptyState={
                <EmptyState
                  icon={Users}
                  title="No users"
                  description="Create a user to manage access control."
                  action={
                    <Button onClick={() => setCreateUserOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create User
                    </Button>
                  }
                />
              }
              className="rounded-md border"
              testId="admin-users-table"
              mobileLayout="cards"
            />
          </TabsContent>

          {/* Roles Tab */}
          <TabsContent value="roles" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreateRoleOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Role
              </Button>
            </div>
            <DataTable
              data={roles}
              columns={roleColumns}
              loading={rolesLoading}
              emptyState={
                <EmptyState
                  icon={Shield}
                  title="No roles"
                  description="Create a role to define access privileges."
                  action={
                    <Button onClick={() => setCreateRoleOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Role
                    </Button>
                  }
                />
              }
              className="rounded-md border"
              testId="admin-roles-table"
              mobileLayout="cards"
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Create a new Aerospike user with roles.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input
                placeholder="username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Roles</Label>
              <div className="max-h-[200px] space-y-2 overflow-auto rounded-md border p-3">
                {roles.length > 0
                  ? roles.map((role) => (
                      <div key={role.name} className="flex items-center gap-2">
                        <Checkbox
                          id={`urole-${role.name}`}
                          checked={newUserRoles.includes(role.name)}
                          onCheckedChange={() => toggleUserRole(role.name)}
                        />
                        <label htmlFor={`urole-${role.name}`} className="cursor-pointer text-sm">
                          {role.name}
                        </label>
                      </div>
                    ))
                  : AVAILABLE_PRIVILEGES.map((priv) => (
                      <div key={priv} className="flex items-center gap-2">
                        <Checkbox
                          id={`upriv-${priv}`}
                          checked={newUserRoles.includes(priv)}
                          onCheckedChange={() => toggleUserRole(priv)}
                        />
                        <label htmlFor={`upriv-${priv}`} className="cursor-pointer text-sm">
                          {priv}
                        </label>
                      </div>
                    ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateUserOpen(false)}
              disabled={creatingUser}
            >
              Cancel
            </Button>
            <LoadingButton
              onClick={handleCreateUser}
              disabled={creatingUser || !newUsername.trim() || !newPassword.trim()}
              loading={creatingUser}
            >
              Create
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={changePassOpen} onOpenChange={setChangePassOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Set a new password for user &quot;{changePassUser}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="New password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePassOpen(false)}>
              Cancel
            </Button>
            <LoadingButton
              onClick={async () => {
                setChangingPass(true);
                try {
                  await changePassword(connId, changePassUser, newPass);
                  toast.success("Password updated");
                  setChangePassOpen(false);
                } catch (err) {
                  toast.error(getErrorMessage(err));
                } finally {
                  setChangingPass(false);
                }
              }}
              disabled={!newPass.trim() || changingPass}
              loading={changingPass}
            >
              Update Password
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Role Dialog */}
      <Dialog open={createRoleOpen} onOpenChange={setCreateRoleOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Define a new role with privileges.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Role Name</Label>
              <Input
                placeholder="role name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Privileges</Label>
              <div className="max-h-[200px] space-y-2 overflow-auto rounded-md border p-3">
                {AVAILABLE_PRIVILEGES.map((priv) => (
                  <div key={priv} className="flex items-center gap-2">
                    <Checkbox
                      id={`rpriv-${priv}`}
                      checked={newRolePrivileges.includes(priv)}
                      onCheckedChange={() => toggleRolePrivilege(priv)}
                    />
                    <label htmlFor={`rpriv-${priv}`} className="cursor-pointer text-sm">
                      {priv}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Whitelist (comma-separated IPs)</Label>
              <Input
                placeholder="0.0.0.0/0"
                value={newRoleWhitelist}
                onChange={(e) => setNewRoleWhitelist(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Read Quota</Label>
                <Input
                  type="number"
                  value={newRoleReadQuota}
                  onChange={(e) => setNewRoleReadQuota(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Write Quota</Label>
                <Input
                  type="number"
                  value={newRoleWriteQuota}
                  onChange={(e) => setNewRoleWriteQuota(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateRoleOpen(false)}
              disabled={creatingRole}
            >
              Cancel
            </Button>
            <LoadingButton
              onClick={handleCreateRole}
              disabled={creatingRole || !newRoleName.trim()}
              loading={creatingRole}
            >
              Create
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <ConfirmDialog
        open={!!deleteUserTarget}
        onOpenChange={(open) => !open && setDeleteUserTarget(null)}
        title="Delete User"
        description={`Are you sure you want to delete user "${deleteUserTarget}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteUser}
        loading={deletingUser}
      />

      {/* Delete Role Confirmation */}
      <ConfirmDialog
        open={!!deleteRoleTarget}
        onOpenChange={(open) => !open && setDeleteRoleTarget(null)}
        title="Delete Role"
        description={`Are you sure you want to delete role "${deleteRoleTarget}"? Users assigned this role will lose its privileges.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteRole}
        loading={deletingRole}
      />
    </div>
  );
}

"use client"

import {
  RiAddLine,
  RiDeleteBin2Line,
  RiKey2Line,
  RiRefreshLine,
  RiShieldKeyholeLine,
  RiShieldUserLine,
  RiUser3Line,
} from "@remixicon/react"
import { type ColumnDef } from "@tanstack/react-table"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import { Label } from "@/components/Label"
import { TabNavigation, TabNavigationLink } from "@/components/TabNavigation"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DataTable } from "@/components/common/DataTable"
import { EmptyState } from "@/components/common/EmptyState"
import { InlineAlert } from "@/components/common/InlineAlert"
import { PageHeader } from "@/components/common/PageHeader"
import { CreateRoleDialog } from "@/components/dialogs/CreateRoleDialog"
import { CreateUserDialog } from "@/components/dialogs/CreateUserDialog"
import { ApiError } from "@/lib/api/client"
import type { AerospikeRole, AerospikeUser, Privilege } from "@/lib/types/admin"
import { useAdminStore } from "@/stores/admin-store"
import { useToastStore } from "@/stores/toast-store"

type PageProps = { params: { clusterId: string } }

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

type TabKey = "users" | "roles"

export default function AdminPage({ params }: PageProps) {
  const { clusterId } = params

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
  } = useAdminStore()

  const [tab, setTab] = useState<TabKey>("users")

  // Dialog state
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)

  const [changePassOpen, setChangePassOpen] = useState(false)
  const [changePassUser, setChangePassUser] = useState("")
  const [newPass, setNewPass] = useState("")
  const [changingPass, setChangingPass] = useState(false)

  const [deleteUserTarget, setDeleteUserTarget] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState(false)

  const [deleteRoleTarget, setDeleteRoleTarget] = useState<string | null>(null)
  const [deletingRole, setDeletingRole] = useState(false)

  const toast = useToastStore((s) => s.addToast)

  const refresh = useCallback(() => {
    void fetchUsers(clusterId)
    void fetchRoles(clusterId)
  }, [clusterId, fetchUsers, fetchRoles])

  useEffect(() => {
    refresh()
  }, [refresh])

  // -- Mutations -----------------------------------------------------------

  const handleCreateUser = async (body: Parameters<typeof createUser>[1]) => {
    try {
      await createUser(clusterId, body)
      toast("success", `User "${body.username}" created`)
    } catch (err) {
      toast("error", errorMessage(err))
      throw err
    }
  }

  const handleCreateRole = async (body: Parameters<typeof createRole>[1]) => {
    try {
      await createRole(clusterId, body)
      toast("success", `Role "${body.name}" created`)
    } catch (err) {
      toast("error", errorMessage(err))
      throw err
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return
    setDeletingUser(true)
    try {
      await deleteUser(clusterId, deleteUserTarget)
      toast("success", `User "${deleteUserTarget}" deleted`)
      setDeleteUserTarget(null)
    } catch (err) {
      toast("error", errorMessage(err))
    } finally {
      setDeletingUser(false)
    }
  }

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return
    setDeletingRole(true)
    try {
      await deleteRole(clusterId, deleteRoleTarget)
      toast("success", `Role "${deleteRoleTarget}" deleted`)
      setDeleteRoleTarget(null)
    } catch (err) {
      toast("error", errorMessage(err))
    } finally {
      setDeletingRole(false)
    }
  }

  const handleChangePassword = async () => {
    if (!changePassUser || !newPass) return
    setChangingPass(true)
    try {
      await changePassword(clusterId, changePassUser, newPass)
      toast("success", `Password updated for "${changePassUser}"`)
      setChangePassOpen(false)
      setNewPass("")
    } catch (err) {
      toast("error", errorMessage(err))
    } finally {
      setChangingPass(false)
    }
  }

  // -- Columns -------------------------------------------------------------

  const userColumns = useMemo<ColumnDef<AerospikeUser>[]>(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "roles",
        header: "Roles",
        cell: ({ getValue }) => {
          const r = getValue() as string[]
          if (!r || r.length === 0)
            return (
              <span className="text-xs italic text-gray-500 dark:text-gray-400">
                No roles
              </span>
            )
          return (
            <div className="flex flex-wrap gap-1">
              {r.map((role) => (
                <Badge key={role} variant="neutral">
                  {role}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: "readQuota",
        header: "Read TPS",
        size: 110,
        cell: ({ getValue }) => {
          const q = getValue() as number
          return (
            <span className="tabular-nums">
              {q === 0 ? "—" : q.toLocaleString()}
            </span>
          )
        },
      },
      {
        accessorKey: "writeQuota",
        header: "Write TPS",
        size: 110,
        cell: ({ getValue }) => {
          const q = getValue() as number
          return (
            <span className="tabular-nums">
              {q === 0 ? "—" : q.toLocaleString()}
            </span>
          )
        },
      },
      {
        accessorKey: "connections",
        header: "Connections",
        size: 110,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-gray-500 dark:text-gray-400">
            {(getValue() as number) ?? 0}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              className="size-8 p-0"
              aria-label={`Change password for ${row.original.username}`}
              onClick={() => {
                setChangePassUser(row.original.username)
                setNewPass("")
                setChangePassOpen(true)
              }}
            >
              <RiKey2Line className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              className="size-8 p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Delete user ${row.original.username}`}
              onClick={() => setDeleteUserTarget(row.original.username)}
            >
              <RiDeleteBin2Line className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  const roleColumns = useMemo<ColumnDef<AerospikeRole>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ getValue }) => (
          <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "privileges",
        header: "Privileges",
        cell: ({ getValue }) => {
          const privs = getValue() as Privilege[]
          if (!privs || privs.length === 0)
            return (
              <span className="text-xs italic text-gray-500 dark:text-gray-400">
                none
              </span>
            )
          return (
            <div className="flex flex-wrap gap-1">
              {privs.map((p, i) => (
                <Badge key={`${p.code}-${i}`} variant="neutral">
                  {p.code}
                  {p.namespace ? ` · ${p.namespace}` : ""}
                  {p.set ? `.${p.set}` : ""}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: "whitelist",
        header: "Whitelist",
        cell: ({ getValue }) => {
          const wl = getValue() as string[]
          return wl && wl.length > 0 ? (
            <span className="font-mono text-xs">{wl.join(", ")}</span>
          ) : (
            <span className="text-xs italic text-gray-500 dark:text-gray-400">
              any
            </span>
          )
        },
      },
      {
        id: "quotas",
        header: "Quotas (R / W)",
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {row.original.readQuota} / {row.original.writeQuota}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              className="size-8 p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={`Delete role ${row.original.name}`}
              onClick={() => setDeleteRoleTarget(row.original.name)}
            >
              <RiDeleteBin2Line className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title="Administration"
        description="Manage users and roles via the Aerospike ACL."
        actions={
          <Button variant="secondary" onClick={refresh}>
            <RiRefreshLine className="mr-2 size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {!isSecurityDisabled && <InlineAlert message={error} />}

      {isSecurityDisabled ? (
        <SecurityDisabledCard />
      ) : (
        <>
          <TabNavigation>
            <TabNavigationLink
              active={tab === "users"}
              onClick={() => setTab("users")}
            >
              <span className="inline-flex items-center gap-2">
                <RiUser3Line className="size-4" aria-hidden="true" />
                Users ({users.length})
              </span>
            </TabNavigationLink>
            <TabNavigationLink
              active={tab === "roles"}
              onClick={() => setTab("roles")}
            >
              <span className="inline-flex items-center gap-2">
                <RiShieldUserLine className="size-4" aria-hidden="true" />
                Roles ({roles.length})
              </span>
            </TabNavigationLink>
          </TabNavigation>

          {tab === "users" && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  onClick={() => setCreateUserOpen(true)}
                >
                  <RiAddLine className="mr-2 size-4" aria-hidden="true" />
                  Create user
                </Button>
              </div>
              <Card className="p-0">
                <DataTable
                  data={users}
                  columns={userColumns}
                  loading={usersLoading}
                  emptyState={
                    <EmptyState
                      icon={RiUser3Line}
                      title="No users"
                      description="Create a user to manage access control."
                      action={
                        <Button
                          variant="primary"
                          onClick={() => setCreateUserOpen(true)}
                        >
                          <RiAddLine
                            className="mr-2 size-4"
                            aria-hidden="true"
                          />
                          Create user
                        </Button>
                      }
                    />
                  }
                  testId="admin-users-table"
                />
              </Card>
            </section>
          )}

          {tab === "roles" && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-end">
                <Button
                  variant="primary"
                  onClick={() => setCreateRoleOpen(true)}
                >
                  <RiAddLine className="mr-2 size-4" aria-hidden="true" />
                  Create role
                </Button>
              </div>
              <Card className="p-0">
                <DataTable
                  data={roles}
                  columns={roleColumns}
                  loading={rolesLoading}
                  emptyState={
                    <EmptyState
                      icon={RiShieldUserLine}
                      title="No roles"
                      description="Create a role to define privileges and quotas."
                      action={
                        <Button
                          variant="primary"
                          onClick={() => setCreateRoleOpen(true)}
                        >
                          <RiAddLine
                            className="mr-2 size-4"
                            aria-hidden="true"
                          />
                          Create role
                        </Button>
                      }
                    />
                  }
                  testId="admin-roles-table"
                />
              </Card>
            </section>
          )}
        </>
      )}

      {/* Dialogs */}
      <CreateUserDialog
        open={createUserOpen}
        onOpenChange={setCreateUserOpen}
        roles={roles}
        onSubmit={handleCreateUser}
      />
      <CreateRoleDialog
        open={createRoleOpen}
        onOpenChange={setCreateRoleOpen}
        onSubmit={handleCreateRole}
      />
      <ChangePasswordDialog
        open={changePassOpen}
        onOpenChange={setChangePassOpen}
        username={changePassUser}
        password={newPass}
        onPasswordChange={setNewPass}
        loading={changingPass}
        onSubmit={handleChangePassword}
      />
      <ConfirmDialog
        open={!!deleteUserTarget}
        onOpenChange={(open) => !open && setDeleteUserTarget(null)}
        title="Delete user"
        description={`Delete user "${deleteUserTarget}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteUser}
        loading={deletingUser}
      />
      <ConfirmDialog
        open={!!deleteRoleTarget}
        onOpenChange={(open) => !open && setDeleteRoleTarget(null)}
        title="Delete role"
        description={`Delete role "${deleteRoleTarget}"? Users assigned this role will lose its privileges.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteRole}
        loading={deletingRole}
      />
    </main>
  )
}

// ---------------------------------------------------------------------------
// Security-disabled state (CE default when `security { }` block is absent)
// ---------------------------------------------------------------------------

function SecurityDisabledCard() {
  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <RiShieldKeyholeLine
        className="size-10 text-amber-500 dark:text-amber-400"
        aria-hidden="true"
      />
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
          Security is not enabled
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
          User and role management requires security to be enabled in
          aerospike.conf. Aerospike CE supports security — it is simply disabled
          by default.
        </p>
      </div>
      <pre className="rounded bg-gray-100 px-4 py-3 text-left font-mono text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-300">
        {`security {
    enable-security true
}`}
      </pre>
      <a
        href="https://aerospike.com/docs/server/operations/configure/security"
        target="_blank"
        rel="noreferrer"
        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        See Aerospike security docs →
      </a>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Change-password dialog (inline; not shared elsewhere)
// ---------------------------------------------------------------------------

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  password: string
  onPasswordChange: (v: string) => void
  loading: boolean
  onSubmit: () => void | Promise<void>
}

function ChangePasswordDialog({
  open,
  onOpenChange,
  username,
  password,
  onPasswordChange,
  loading,
  onSubmit,
}: ChangePasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex flex-col gap-y-4">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Set a new password for user &quot;{username}&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-y-1.5">
            <Label htmlFor="cp-newpass">New password</Label>
            <Input
              id="cp-newpass"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onSubmit()}
              isLoading={loading}
              disabled={loading || !password}
            >
              Update password
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

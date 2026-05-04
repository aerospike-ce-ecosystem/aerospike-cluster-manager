"use client"

import { Badge } from "@/components/Badge"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import { CreateRoleDialog } from "@/components/dialogs/CreateRoleDialog"
import { CreateUserDialog } from "@/components/dialogs/CreateUserDialog"
import { Input } from "@/components/Input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { listRoles, listUsers } from "@/lib/api/admin"
import { mapApiError } from "@/lib/api/error-mapping"
import { logFetchError } from "@/lib/api/log"
import type { AerospikeRole, AerospikeUser } from "@/lib/types/admin"
import { RiShieldKeyholeLine } from "@remixicon/react"
import { useCallback, useEffect, useState } from "react"

type PageProps = { params: { clusterId: string } }

type LoadState<T> = { data: T | null; loading: boolean; error: string | null }

export default function AdminPage({ params }: PageProps) {
  const [usersState, setUsersState] = useState<LoadState<AerospikeUser[]>>({
    data: null,
    loading: true,
    error: null,
  })
  const [rolesState, setRolesState] = useState<LoadState<AerospikeRole[]>>({
    data: null,
    loading: true,
    error: null,
  })
  const [securityDisabled, setSecurityDisabled] = useState(false)
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)

  const load = useCallback(async () => {
    setUsersState((s) => ({ ...s, loading: true, error: null }))
    setRolesState((s) => ({ ...s, loading: true, error: null }))
    setSecurityDisabled(false)
    try {
      const [users, roles] = await Promise.all([
        listUsers(params.clusterId),
        listRoles(params.clusterId),
      ])
      setUsersState({ data: users, loading: false, error: null })
      setRolesState({ data: roles, loading: false, error: null })
    } catch (err) {
      logFetchError("admin", err)
      const mapped = mapApiError(err)
      // Admin endpoints refuse access either because security is off (CE
      // default) or the connecting user lacks ACL — both surface as the
      // same explanatory card here.
      if (
        mapped.kind === "security-disabled" ||
        mapped.kind === "permission-denied"
      ) {
        setSecurityDisabled(true)
        setUsersState({ data: null, loading: false, error: null })
        setRolesState({ data: null, loading: false, error: null })
        return
      }
      setUsersState({ data: null, loading: false, error: mapped.message })
      setRolesState({ data: null, loading: false, error: mapped.message })
    }
  }, [params.clusterId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Admin
          </span>
          <h1 className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-50">
            Users &amp; roles
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Aerospike ACL — available when security is enabled in
            aerospike.conf.
          </p>
        </div>
      </header>

      {securityDisabled ? (
        <SecurityDisabledState />
      ) : (
        <>
          <UsersSection
            state={usersState}
            onCreate={() => setCreateUserOpen(true)}
          />
          <RolesSection
            state={rolesState}
            onCreate={() => setCreateRoleOpen(true)}
          />
          <CreateUserDialog
            clusterId={params.clusterId}
            open={createUserOpen}
            onOpenChange={setCreateUserOpen}
            onCreated={() => {
              void load()
            }}
          />
          <CreateRoleDialog
            clusterId={params.clusterId}
            open={createRoleOpen}
            onOpenChange={setCreateRoleOpen}
            onCreated={() => {
              void load()
            }}
          />
        </>
      )}
    </main>
  )
}

function SecurityDisabledState() {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <RiShieldKeyholeLine
        className="size-10 text-amber-500 dark:text-amber-400"
        aria-hidden="true"
      />
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">
        Security is not enabled
      </h3>
      <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
        User and role management requires security. Add a{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-900">
          security {"{ }"}
        </code>{" "}
        block to your{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-900">
          aerospike.conf
        </code>{" "}
        and restart the cluster to enable this feature.
      </p>
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

function UsersSection({
  state,
  onCreate,
}: {
  state: LoadState<AerospikeUser[]>
  onCreate: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
          Users
        </h2>
        <div className="flex gap-2">
          <Input
            type="search"
            placeholder="Filter users..."
            className="sm:w-60"
          />
          <Button variant="primary" onClick={onCreate}>
            Create user
          </Button>
        </div>
      </div>
      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </div>
      )}
      <Card className="p-0">
        <TableRoot>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>User</TableHeaderCell>
                <TableHeaderCell>Roles</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Read quota (TPS)
                </TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Write quota (TPS)
                </TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Connections
                </TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.loading ? (
                <SkeletonRows cols={6} rows={3} />
              ) : state.data && state.data.length > 0 ? (
                state.data.map((u) => (
                  <TableRow key={u.username}>
                    <TableCell>
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
                        {u.username}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="neutral">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.readQuota === 0 ? "—" : u.readQuota.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.writeQuota === 0 ? "—" : u.writeQuota.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-gray-500">
                      {u.connections ?? 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="h-7 px-2 text-xs">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-6 text-center text-sm text-gray-500"
                  >
                    No users.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </Card>
    </section>
  )
}

function RolesSection({
  state,
  onCreate,
}: {
  state: LoadState<AerospikeRole[]>
  onCreate: () => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
          Roles
        </h2>
        <Button variant="primary" onClick={onCreate}>
          Create role
        </Button>
      </div>
      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </div>
      )}
      <Card className="p-0">
        <TableRoot>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Privileges</TableHeaderCell>
                <TableHeaderCell>Whitelist</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {state.loading ? (
                <SkeletonRows cols={4} rows={2} />
              ) : state.data && state.data.length > 0 ? (
                state.data.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>
                      <span className="font-mono font-semibold text-gray-900 dark:text-gray-50">
                        {r.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.privileges.map((p, i) => (
                          <Badge key={`${r.name}-priv-${i}`} variant="neutral">
                            {p.code}
                            {p.namespace ? ` · ${p.namespace}` : ""}
                            {p.set ? `.${p.set}` : ""}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.whitelist && r.whitelist.length > 0 ? (
                        r.whitelist.join(", ")
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="h-7 px-2 text-xs">
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-gray-500"
                  >
                    No roles.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      </Card>
    </section>
  )
}

function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <TableCell key={c}>
              <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

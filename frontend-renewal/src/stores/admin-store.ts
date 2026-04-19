/**
 * Admin store — Aerospike users + roles per connection.
 *
 * Ported from `frontend/src/stores/admin-store.ts`, adapted to the renewal
 * API module split (`@/lib/api/admin`) and `ApiError` exception type.
 *
 * Behaviour notes:
 *  - On 403 with the "Security is not enabled" EE_MSG, the store flips
 *    `isSecurityDisabled = true` and clears `error` so the page can render the
 *    explanatory state instead of a hard error banner. CE supports security
 *    when users add a `security { }` block — we do NOT hide the tab.
 */

import { create } from "zustand"

import {
  changeUserPassword,
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  listRoles,
  listUsers,
} from "@/lib/api/admin"
import { ApiError } from "@/lib/api/client"
import type {
  AerospikeRole,
  AerospikeUser,
  CreateRoleRequest,
  CreateUserRequest,
} from "@/lib/types/admin"

interface AdminState {
  users: AerospikeUser[]
  roles: AerospikeRole[]
  usersLoading: boolean
  rolesLoading: boolean
  error: string | null
  isSecurityDisabled: boolean

  fetchUsers: (connId: string) => Promise<void>
  fetchRoles: (connId: string) => Promise<void>
  createUser: (connId: string, data: CreateUserRequest) => Promise<void>
  changePassword: (
    connId: string,
    username: string,
    password: string,
  ) => Promise<void>
  deleteUser: (connId: string, username: string) => Promise<void>
  createRole: (connId: string, data: CreateRoleRequest) => Promise<void>
  deleteRole: (connId: string, name: string) => Promise<void>
  reset: () => void
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  users: [],
  roles: [],
  usersLoading: false,
  rolesLoading: false,
  error: null,
  isSecurityDisabled: false,

  fetchUsers: async (connId) => {
    set({ usersLoading: true, error: null })
    try {
      const users = await listUsers(connId)
      set({ users, usersLoading: false, isSecurityDisabled: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        set({
          isSecurityDisabled: true,
          usersLoading: false,
          error: null,
          users: [],
        })
        return
      }
      set({ error: errorMessage(err), usersLoading: false })
    }
  },

  fetchRoles: async (connId) => {
    set({ rolesLoading: true, error: null })
    try {
      const roles = await listRoles(connId)
      set({ roles, rolesLoading: false, isSecurityDisabled: false })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        set({
          isSecurityDisabled: true,
          rolesLoading: false,
          error: null,
          roles: [],
        })
        return
      }
      set({ error: errorMessage(err), rolesLoading: false })
    }
  },

  createUser: async (connId, data) => {
    try {
      await createUser(connId, data)
      await get().fetchUsers(connId)
    } catch (err) {
      set({ error: errorMessage(err) })
      throw err
    }
  },

  changePassword: async (connId, username, password) => {
    try {
      await changeUserPassword(connId, { username, password })
    } catch (err) {
      set({ error: errorMessage(err) })
      throw err
    }
  },

  deleteUser: async (connId, username) => {
    try {
      await deleteUser(connId, username)
      await get().fetchUsers(connId)
    } catch (err) {
      set({ error: errorMessage(err) })
      throw err
    }
  },

  createRole: async (connId, data) => {
    try {
      await createRole(connId, data)
      await get().fetchRoles(connId)
    } catch (err) {
      set({ error: errorMessage(err) })
      throw err
    }
  },

  deleteRole: async (connId, name) => {
    try {
      await deleteRole(connId, name)
      await get().fetchRoles(connId)
    } catch (err) {
      set({ error: errorMessage(err) })
      throw err
    }
  },

  reset: () =>
    set({
      users: [],
      roles: [],
      usersLoading: false,
      rolesLoading: false,
      error: null,
      isSecurityDisabled: false,
    }),
}))

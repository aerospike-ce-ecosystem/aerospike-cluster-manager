import { create } from "zustand";
import type {
  AerospikeUser,
  AerospikeRole,
  CreateUserRequest,
  CreateRoleRequest,
} from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { getErrorMessage } from "@/lib/utils";

interface AdminState {
  users: AerospikeUser[];
  roles: AerospikeRole[];
  usersLoading: boolean;
  rolesLoading: boolean;
  error: string | null;
  isSecurityDisabled: boolean;

  fetchUsers: (connId: string) => Promise<void>;
  fetchRoles: (connId: string) => Promise<void>;
  createUser: (connId: string, data: CreateUserRequest) => Promise<void>;
  changePassword: (connId: string, username: string, password: string) => Promise<void>;
  deleteUser: (connId: string, username: string) => Promise<void>;
  createRole: (connId: string, data: CreateRoleRequest) => Promise<void>;
  deleteRole: (connId: string, name: string) => Promise<void>;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  users: [],
  roles: [],
  usersLoading: false,
  rolesLoading: false,
  error: null,
  isSecurityDisabled: false,

  fetchUsers: async (connId) => {
    set({ usersLoading: true, error: null });
    try {
      const users = await api.getUsers(connId);
      set({ users, usersLoading: false, isSecurityDisabled: false });
    } catch (error) {
      if (isApiError(error) && error.status === 403) {
        set({ isSecurityDisabled: true, usersLoading: false, error: null });
      } else {
        set({ error: getErrorMessage(error), usersLoading: false });
      }
    }
  },

  fetchRoles: async (connId) => {
    set({ rolesLoading: true, error: null });
    try {
      const roles = await api.getRoles(connId);
      set({ roles, rolesLoading: false, isSecurityDisabled: false });
    } catch (error) {
      if (isApiError(error) && error.status === 403) {
        set({ isSecurityDisabled: true, rolesLoading: false, error: null });
      } else {
        set({ error: getErrorMessage(error), rolesLoading: false });
      }
    }
  },

  createUser: async (connId, data) => {
    try {
      await api.createUser(connId, data);
      await get().fetchUsers(connId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  changePassword: async (connId, username, password) => {
    try {
      await api.changePassword(connId, username, password);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteUser: async (connId, username) => {
    try {
      await api.deleteUser(connId, username);
      await get().fetchUsers(connId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  createRole: async (connId, data) => {
    try {
      await api.createRole(connId, data);
      await get().fetchRoles(connId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },

  deleteRole: async (connId, name) => {
    try {
      await api.deleteRole(connId, name);
      await get().fetchRoles(connId);
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  },
}));

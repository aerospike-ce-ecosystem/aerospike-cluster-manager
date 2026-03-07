import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAdminStore } from "../admin-store";
import { ApiError } from "@/lib/api/errors";

// Mock the API client
vi.mock("@/lib/api/client", () => ({
  api: {
    getUsers: vi.fn(),
    getRoles: vi.fn(),
    createUser: vi.fn(),
    changePassword: vi.fn(),
    deleteUser: vi.fn(),
    createRole: vi.fn(),
    deleteRole: vi.fn(),
  },
}));

import { api } from "@/lib/api/client";
const mockApi = vi.mocked(api);

const mockUsers = [
  { username: "admin", roles: ["admin"], readQuota: 0, writeQuota: 0, connections: 5 },
  { username: "reader", roles: ["read-only"], readQuota: 100, writeQuota: 0, connections: 2 },
];

const mockRoles = [
  {
    name: "admin",
    privileges: [{ code: "sys-admin" }],
    whitelist: [],
    readQuota: 0,
    writeQuota: 0,
  },
  {
    name: "read-only",
    privileges: [{ code: "read", namespace: "test" }],
    whitelist: [],
    readQuota: 100,
    writeQuota: 0,
  },
];

describe("useAdminStore", () => {
  beforeEach(() => {
    useAdminStore.setState({
      users: [],
      roles: [],
      usersLoading: false,
      rolesLoading: false,
      error: null,
      isSecurityDisabled: false,
    });
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useAdminStore.getState();
    expect(state.users).toEqual([]);
    expect(state.roles).toEqual([]);
    expect(state.usersLoading).toBe(false);
    expect(state.rolesLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isSecurityDisabled).toBe(false);
  });

  // --- fetchUsers ---

  it("fetchUsers sets usersLoading and populates users", async () => {
    mockApi.getUsers.mockResolvedValue(mockUsers as any);

    await useAdminStore.getState().fetchUsers("conn-1");

    const state = useAdminStore.getState();
    expect(state.users).toEqual(mockUsers);
    expect(state.usersLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isSecurityDisabled).toBe(false);
    expect(mockApi.getUsers).toHaveBeenCalledWith("conn-1");
  });

  it("fetchUsers sets error on generic failure", async () => {
    mockApi.getUsers.mockRejectedValue(new Error("Network error"));

    await useAdminStore.getState().fetchUsers("conn-1");

    const state = useAdminStore.getState();
    expect(state.error).toBe("Network error");
    expect(state.usersLoading).toBe(false);
    expect(state.isSecurityDisabled).toBe(false);
  });

  it("fetchUsers sets isSecurityDisabled on 403 ApiError", async () => {
    mockApi.getUsers.mockRejectedValue(new ApiError("Forbidden", 403));

    await useAdminStore.getState().fetchUsers("conn-1");

    const state = useAdminStore.getState();
    expect(state.isSecurityDisabled).toBe(true);
    expect(state.usersLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchUsers treats non-403 ApiError as generic error", async () => {
    mockApi.getUsers.mockRejectedValue(new ApiError("Server error", 500));

    await useAdminStore.getState().fetchUsers("conn-1");

    const state = useAdminStore.getState();
    expect(state.isSecurityDisabled).toBe(false);
    expect(state.error).toBe("Server error");
    expect(state.usersLoading).toBe(false);
  });

  // --- fetchRoles ---

  it("fetchRoles sets rolesLoading and populates roles", async () => {
    mockApi.getRoles.mockResolvedValue(mockRoles as any);

    await useAdminStore.getState().fetchRoles("conn-1");

    const state = useAdminStore.getState();
    expect(state.roles).toEqual(mockRoles);
    expect(state.rolesLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isSecurityDisabled).toBe(false);
    expect(mockApi.getRoles).toHaveBeenCalledWith("conn-1");
  });

  it("fetchRoles sets error on generic failure", async () => {
    mockApi.getRoles.mockRejectedValue(new Error("Connection refused"));

    await useAdminStore.getState().fetchRoles("conn-1");

    const state = useAdminStore.getState();
    expect(state.error).toBe("Connection refused");
    expect(state.rolesLoading).toBe(false);
  });

  it("fetchRoles sets isSecurityDisabled on 403 ApiError", async () => {
    mockApi.getRoles.mockRejectedValue(new ApiError("Forbidden", 403));

    await useAdminStore.getState().fetchRoles("conn-1");

    const state = useAdminStore.getState();
    expect(state.isSecurityDisabled).toBe(true);
    expect(state.rolesLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("fetchRoles treats non-403 ApiError as generic error", async () => {
    mockApi.getRoles.mockRejectedValue(new ApiError("Bad request", 400));

    await useAdminStore.getState().fetchRoles("conn-1");

    const state = useAdminStore.getState();
    expect(state.isSecurityDisabled).toBe(false);
    expect(state.error).toBe("Bad request");
  });

  // --- createUser ---

  it("createUser calls API and refreshes user list", async () => {
    mockApi.createUser.mockResolvedValue({} as any);
    mockApi.getUsers.mockResolvedValue(mockUsers as any);

    const createData = { username: "newuser", password: "pass123", roles: ["read-only"] };
    await useAdminStore.getState().createUser("conn-1", createData);

    expect(mockApi.createUser).toHaveBeenCalledWith("conn-1", createData);
    expect(mockApi.getUsers).toHaveBeenCalledWith("conn-1");

    const state = useAdminStore.getState();
    expect(state.users).toEqual(mockUsers);
  });

  it("createUser sets error and re-throws on failure", async () => {
    mockApi.createUser.mockRejectedValue(new Error("User already exists"));

    const createData = { username: "existing", password: "pass123", roles: ["admin"] };

    await expect(useAdminStore.getState().createUser("conn-1", createData)).rejects.toThrow(
      "User already exists",
    );

    const state = useAdminStore.getState();
    expect(state.error).toBe("User already exists");
  });

  // --- changePassword ---

  it("changePassword calls API successfully", async () => {
    mockApi.changePassword.mockResolvedValue({ message: "OK" });

    await useAdminStore.getState().changePassword("conn-1", "admin", "newpass");

    expect(mockApi.changePassword).toHaveBeenCalledWith("conn-1", "admin", "newpass");
  });

  it("changePassword sets error and re-throws on failure", async () => {
    mockApi.changePassword.mockRejectedValue(new Error("Weak password"));

    await expect(useAdminStore.getState().changePassword("conn-1", "admin", "123")).rejects.toThrow(
      "Weak password",
    );

    expect(useAdminStore.getState().error).toBe("Weak password");
  });

  // --- deleteUser ---

  it("deleteUser calls API and refreshes user list", async () => {
    mockApi.deleteUser.mockResolvedValue(undefined as any);
    mockApi.getUsers.mockResolvedValue([mockUsers[0]] as any);

    await useAdminStore.getState().deleteUser("conn-1", "reader");

    expect(mockApi.deleteUser).toHaveBeenCalledWith("conn-1", "reader");
    expect(mockApi.getUsers).toHaveBeenCalledWith("conn-1");

    const state = useAdminStore.getState();
    expect(state.users).toEqual([mockUsers[0]]);
  });

  it("deleteUser sets error and re-throws on failure", async () => {
    mockApi.deleteUser.mockRejectedValue(new Error("Cannot delete admin"));

    await expect(useAdminStore.getState().deleteUser("conn-1", "admin")).rejects.toThrow(
      "Cannot delete admin",
    );

    expect(useAdminStore.getState().error).toBe("Cannot delete admin");
  });

  // --- createRole ---

  it("createRole calls API and refreshes role list", async () => {
    mockApi.createRole.mockResolvedValue({} as any);
    mockApi.getRoles.mockResolvedValue(mockRoles as any);

    const createData = {
      name: "write-only",
      privileges: [{ code: "write", namespace: "test" }],
    };
    await useAdminStore.getState().createRole("conn-1", createData);

    expect(mockApi.createRole).toHaveBeenCalledWith("conn-1", createData);
    expect(mockApi.getRoles).toHaveBeenCalledWith("conn-1");

    const state = useAdminStore.getState();
    expect(state.roles).toEqual(mockRoles);
  });

  it("createRole sets error and re-throws on failure", async () => {
    mockApi.createRole.mockRejectedValue(new Error("Role already exists"));

    const createData = { name: "admin", privileges: [{ code: "sys-admin" }] };

    await expect(useAdminStore.getState().createRole("conn-1", createData)).rejects.toThrow(
      "Role already exists",
    );

    expect(useAdminStore.getState().error).toBe("Role already exists");
  });

  // --- deleteRole ---

  it("deleteRole calls API and refreshes role list", async () => {
    mockApi.deleteRole.mockResolvedValue(undefined as any);
    mockApi.getRoles.mockResolvedValue([mockRoles[0]] as any);

    await useAdminStore.getState().deleteRole("conn-1", "read-only");

    expect(mockApi.deleteRole).toHaveBeenCalledWith("conn-1", "read-only");
    expect(mockApi.getRoles).toHaveBeenCalledWith("conn-1");

    const state = useAdminStore.getState();
    expect(state.roles).toEqual([mockRoles[0]]);
  });

  it("deleteRole sets error and re-throws on failure", async () => {
    mockApi.deleteRole.mockRejectedValue(new Error("Role in use"));

    await expect(useAdminStore.getState().deleteRole("conn-1", "admin")).rejects.toThrow(
      "Role in use",
    );

    expect(useAdminStore.getState().error).toBe("Role in use");
  });

  // --- Error state management ---

  it("fetchUsers clears previous error on new fetch", async () => {
    // First set an error state
    useAdminStore.setState({ error: "Previous error" });

    mockApi.getUsers.mockResolvedValue(mockUsers as any);

    await useAdminStore.getState().fetchUsers("conn-1");

    expect(useAdminStore.getState().error).toBeNull();
  });

  it("fetchRoles clears previous error on new fetch", async () => {
    useAdminStore.setState({ error: "Previous error" });

    mockApi.getRoles.mockResolvedValue(mockRoles as any);

    await useAdminStore.getState().fetchRoles("conn-1");

    expect(useAdminStore.getState().error).toBeNull();
  });

  it("fetchUsers resets isSecurityDisabled on success after previous 403", async () => {
    useAdminStore.setState({ isSecurityDisabled: true });

    mockApi.getUsers.mockResolvedValue(mockUsers as any);

    await useAdminStore.getState().fetchUsers("conn-1");

    expect(useAdminStore.getState().isSecurityDisabled).toBe(false);
  });
});

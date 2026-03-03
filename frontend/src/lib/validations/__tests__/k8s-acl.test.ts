import { describe, it, expect } from "vitest";
import {
  aclRoleSpecSchema,
  aclUserSpecSchema,
  aclConfigSchema,
  validateACLConfig,
} from "../k8s-acl";
import type { ACLConfig } from "@/lib/api/types";

describe("aclRoleSpecSchema", () => {
  it("accepts a valid role", () => {
    const result = aclRoleSpecSchema.safeParse({
      name: "reader",
      privileges: ["read"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty role name", () => {
    const result = aclRoleSpecSchema.safeParse({
      name: "",
      privileges: ["read"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty privileges array", () => {
    const result = aclRoleSpecSchema.safeParse({
      name: "reader",
      privileges: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid privilege name", () => {
    const result = aclRoleSpecSchema.safeParse({
      name: "reader",
      privileges: ["invalid-privilege"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional whitelist", () => {
    const result = aclRoleSpecSchema.safeParse({
      name: "reader",
      privileges: ["read"],
      whitelist: ["10.0.0.0/8"],
    });
    expect(result.success).toBe(true);
  });
});

describe("aclUserSpecSchema", () => {
  it("accepts a valid user", () => {
    const result = aclUserSpecSchema.safeParse({
      name: "admin",
      secretName: "admin-secret",
      roles: ["admin-role"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty user name", () => {
    const result = aclUserSpecSchema.safeParse({
      name: "",
      secretName: "admin-secret",
      roles: ["admin-role"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects secret shorter than 6 characters", () => {
    const result = aclUserSpecSchema.safeParse({
      name: "admin",
      secretName: "abc",
      roles: ["admin-role"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty roles array", () => {
    const result = aclUserSpecSchema.safeParse({
      name: "admin",
      secretName: "admin-secret",
      roles: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("aclConfigSchema", () => {
  it("accepts a valid ACL config", () => {
    const result = aclConfigSchema.safeParse({
      enabled: true,
      roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
      users: [{ name: "admin", secretName: "admin-secret", roles: ["admin-role"] }],
      adminPolicyTimeout: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 8 users (CE limit)", () => {
    const users = Array.from({ length: 9 }, (_, i) => ({
      name: `user-${i}`,
      secretName: `secret-${i}-long`,
      roles: ["reader"],
    }));
    const result = aclConfigSchema.safeParse({
      enabled: true,
      roles: [{ name: "reader", privileges: ["read"] }],
      users,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("8");
    }
  });

  it("accepts exactly 8 users", () => {
    const users = Array.from({ length: 8 }, (_, i) => ({
      name: `user-${i}`,
      secretName: `secret-${i}-long`,
      roles: ["reader"],
    }));
    const result = aclConfigSchema.safeParse({
      enabled: true,
      roles: [{ name: "reader", privileges: ["read"] }],
      users,
    });
    expect(result.success).toBe(true);
  });
});

describe("validateACLConfig", () => {
  it("returns null when ACL is disabled", () => {
    const acl: ACLConfig = {
      enabled: false,
      roles: [],
      users: [],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toBeNull();
  });

  it("returns error when ACL is enabled but no users configured", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
      users: [],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toContain("no users");
  });

  it("returns error when ACL is enabled but no admin user exists", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "reader", privileges: ["read"] }],
      users: [{ name: "normaluser", secretName: "normal-secret", roles: ["reader"] }],
      adminPolicyTimeout: 0,
    };
    const error = validateACLConfig(acl);
    expect(error).not.toBeNull();
    expect(error).toContain("admin");
  });

  it("returns null when a user named 'admin' exists", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "reader", privileges: ["read"] }],
      users: [{ name: "admin", secretName: "admin-secret", roles: ["reader"] }],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toBeNull();
  });

  it("returns null when a user has sys-admin role", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "superadmin", privileges: ["sys-admin"] }],
      users: [{ name: "operator", secretName: "operator-secret", roles: ["superadmin"] }],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toBeNull();
  });

  it("returns null when a user has user-admin role", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "useradm", privileges: ["user-admin"] }],
      users: [{ name: "manager", secretName: "manager-secret", roles: ["useradm"] }],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toBeNull();
  });

  it("returns error for more than 8 users", () => {
    const users = Array.from({ length: 9 }, (_, i) => ({
      name: i === 0 ? "admin" : `user-${i}`,
      secretName: `secret-${i}-long`,
      roles: ["reader"],
    }));
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "reader", privileges: ["read"] }],
      users,
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toContain("8");
  });

  it("returns error for duplicate user names", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [{ name: "superadmin", privileges: ["sys-admin"] }],
      users: [
        { name: "admin", secretName: "admin-secret", roles: ["superadmin"] },
        { name: "admin", secretName: "admin-secret-2", roles: ["superadmin"] },
      ],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toContain("unique");
  });

  it("returns error for duplicate role names", () => {
    const acl: ACLConfig = {
      enabled: true,
      roles: [
        { name: "myrole", privileges: ["sys-admin"] },
        { name: "myrole", privileges: ["read"] },
      ],
      users: [{ name: "admin", secretName: "admin-secret", roles: ["myrole"] }],
      adminPolicyTimeout: 0,
    };
    expect(validateACLConfig(acl)).toContain("unique");
  });
});

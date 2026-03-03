import { z } from "zod";

import type { ACLConfig } from "@/lib/api/types";

/** Valid Aerospike CE privilege names. */
export const AEROSPIKE_PRIVILEGES = [
  "read",
  "read-write",
  "read-write-udf",
  "sys-admin",
  "data-admin",
  "user-admin",
] as const;

export type AerospikePrivilege = (typeof AEROSPIKE_PRIVILEGES)[number];

/** Maximum number of ACL users in Aerospike CE. */
const MAX_CE_ACL_USERS = 8;

/** Minimum password length for ACL user secrets. */
const MIN_PASSWORD_LENGTH = 6;

export const aclRoleSpecSchema = z.object({
  name: z.string().min(1, "Role name is required"),
  privileges: z
    .array(z.enum(AEROSPIKE_PRIVILEGES))
    .min(1, "At least one privilege is required"),
  whitelist: z.array(z.string()).optional(),
});

export const aclUserSpecSchema = z.object({
  name: z.string().min(1, "User name is required"),
  secretName: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Secret name must be at least ${MIN_PASSWORD_LENGTH} characters`),
  roles: z.array(z.string().min(1)).min(1, "At least one role is required"),
});

export const aclConfigSchema = z.object({
  enabled: z.boolean(),
  roles: z.array(aclRoleSpecSchema),
  users: z.array(aclUserSpecSchema).max(MAX_CE_ACL_USERS, `CE supports at most ${MAX_CE_ACL_USERS} ACL users`),
  adminPolicyTimeout: z.number().int().min(0).optional(),
});

/**
 * Validate ACL configuration beyond what Zod schema covers.
 * Returns an error message string, or null if valid.
 */
export function validateACLConfig(acl: ACLConfig): string | null {
  if (!acl.enabled) return null;

  if (acl.users.length === 0) {
    return "ACL is enabled but no users are configured";
  }

  if (acl.users.length > MAX_CE_ACL_USERS) {
    return `Aerospike CE supports at most ${MAX_CE_ACL_USERS} ACL users`;
  }

  // At least one admin user (with sys-admin or user-admin role, or named 'admin')
  const adminRoleNames = new Set(
    acl.roles.filter((r) => r.privileges.some((p) => p === "sys-admin" || p === "user-admin")).map((r) => r.name),
  );

  const hasAdminUser = acl.users.some(
    (u) => u.name === "admin" || u.roles.some((r) => adminRoleNames.has(r)),
  );

  if (!hasAdminUser) {
    return "ACL is enabled but no admin user is configured. Add a user named 'admin' or assign sys-admin/user-admin role.";
  }

  // Validate privilege names
  const validPrivileges = new Set<string>(AEROSPIKE_PRIVILEGES);
  for (const role of acl.roles) {
    for (const priv of role.privileges) {
      if (!validPrivileges.has(priv)) {
        return `Invalid privilege "${priv}" in role "${role.name}"`;
      }
    }
  }

  // Unique user names
  const userNames = acl.users.map((u) => u.name);
  if (new Set(userNames).size !== userNames.length) {
    return "ACL user names must be unique";
  }

  // Unique role names
  const roleNames = acl.roles.map((r) => r.name);
  if (new Set(roleNames).size !== roleNames.length) {
    return "ACL role names must be unique";
  }

  return null;
}

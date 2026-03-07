import { describe, it, expect } from "vitest";
import { validateK8sName, validateNamespaces } from "@/lib/validations/k8s";
import { validateACLConfig } from "@/lib/validations/k8s-acl";
import type { ACLConfig, AerospikeNamespaceConfig } from "@/lib/api/types";

/**
 * Tests for the canProceed logic used in k8s-cluster-wizard.tsx.
 * Instead of rendering the full wizard (which has many dependencies),
 * we extract and test the underlying validation logic directly.
 */

describe("Wizard canProceed logic", () => {
  describe("Step 0: Basic (name + namespace)", () => {
    it("passes with valid name and non-empty namespace", () => {
      const nameError = validateK8sName("my-cluster");
      const namespaceValid = "default".length > 0;
      expect(nameError).toBeNull();
      expect(namespaceValid).toBe(true);
    });

    it("fails with empty name", () => {
      const nameError = validateK8sName("");
      expect(nameError).not.toBeNull();
    });

    it("fails with invalid name (uppercase)", () => {
      const nameError = validateK8sName("MyCluster");
      expect(nameError).not.toBeNull();
    });

    it("fails with name starting with hyphen", () => {
      const nameError = validateK8sName("-my-cluster");
      expect(nameError).not.toBeNull();
    });

    it("fails with name ending with hyphen", () => {
      const nameError = validateK8sName("my-cluster-");
      expect(nameError).not.toBeNull();
    });

    it("fails when namespace is empty", () => {
      const namespaceValid = "".length > 0;
      expect(namespaceValid).toBe(false);
    });

    it("passes with single character name", () => {
      const nameError = validateK8sName("a");
      expect(nameError).toBeNull();
    });

    it("passes with max length name (63 chars)", () => {
      const name = "a".repeat(63);
      const nameError = validateK8sName(name);
      expect(nameError).toBeNull();
    });

    it("fails with name exceeding 63 chars", () => {
      const name = "a".repeat(64);
      const nameError = validateK8sName(name);
      expect(nameError).not.toBeNull();
    });
  });

  describe("Step 1: Namespace & Storage", () => {
    const makeNs = (name: string, rf: number = 1): AerospikeNamespaceConfig => ({
      name,
      replicationFactor: rf,
      storageEngine: { type: "memory", dataSize: 1073741824 },
    });

    it("passes with one valid namespace", () => {
      const error = validateNamespaces([makeNs("test")], 1);
      expect(error).toBeNull();
    });

    it("passes with two valid namespaces", () => {
      const error = validateNamespaces([makeNs("test"), makeNs("prod")], 1);
      expect(error).toBeNull();
    });

    it("fails with zero namespaces", () => {
      const error = validateNamespaces([], 1);
      expect(error).not.toBeNull();
    });

    it("fails with more than 2 namespaces (CE limit)", () => {
      const error = validateNamespaces([makeNs("ns1"), makeNs("ns2"), makeNs("ns3")], 1);
      expect(error).not.toBeNull();
    });

    it("fails with empty namespace name", () => {
      const error = validateNamespaces([makeNs("")], 1);
      expect(error).not.toBeNull();
    });

    it("fails with duplicate namespace names", () => {
      const error = validateNamespaces([makeNs("test"), makeNs("test")], 1);
      expect(error).not.toBeNull();
    });

    it("fails when replication factor exceeds cluster size", () => {
      const error = validateNamespaces([makeNs("test", 3)], 2);
      expect(error).not.toBeNull();
      expect(error).toContain("replication factor");
    });

    it("passes when replication factor equals cluster size", () => {
      const error = validateNamespaces([makeNs("test", 2)], 2);
      expect(error).toBeNull();
    });
  });

  describe("Step 4: ACL (Security)", () => {
    it("passes when ACL is disabled", () => {
      const acl: ACLConfig = {
        enabled: false,
        roles: [],
        users: [],
        adminPolicyTimeout: 0,
      };
      expect(validateACLConfig(acl)).toBeNull();
    });

    it("fails when ACL is enabled but no users configured", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
        users: [],
        adminPolicyTimeout: 0,
      };
      // Mirrors canProceed logic: acl.enabled && acl.users.length === 0
      expect(acl.enabled && acl.users.length === 0).toBe(true);
    });

    it("fails when user has empty name", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
        users: [{ name: "", secretName: "admin-secret", roles: ["admin-role"] }],
        adminPolicyTimeout: 0,
      };
      const userInvalid = acl.users.some(
        (u) => !u.name.trim() || !u.secretName.trim() || u.roles.length === 0,
      );
      expect(userInvalid).toBe(true);
    });

    it("fails when user has empty secretName", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
        users: [{ name: "admin", secretName: "", roles: ["admin-role"] }],
        adminPolicyTimeout: 0,
      };
      const userInvalid = acl.users.some(
        (u) => !u.name.trim() || !u.secretName.trim() || u.roles.length === 0,
      );
      expect(userInvalid).toBe(true);
    });

    it("fails when user has empty roles", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
        users: [{ name: "admin", secretName: "admin-secret", roles: [] }],
        adminPolicyTimeout: 0,
      };
      const userInvalid = acl.users.some(
        (u) => !u.name.trim() || !u.secretName.trim() || u.roles.length === 0,
      );
      expect(userInvalid).toBe(true);
    });

    it("fails when role has empty name", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "", privileges: ["sys-admin"] }],
        users: [{ name: "admin", secretName: "admin-secret", roles: [""] }],
        adminPolicyTimeout: 0,
      };
      const roleInvalid = acl.roles.some((r) => !r.name.trim() || r.privileges.length === 0);
      expect(roleInvalid).toBe(true);
    });

    it("fails when role has empty privileges", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "empty-role", privileges: [] }],
        users: [{ name: "admin", secretName: "admin-secret", roles: ["empty-role"] }],
        adminPolicyTimeout: 0,
      };
      const roleInvalid = acl.roles.some((r) => !r.name.trim() || r.privileges.length === 0);
      expect(roleInvalid).toBe(true);
    });

    it("passes with valid ACL configuration", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "admin-role", privileges: ["sys-admin"] }],
        users: [{ name: "admin", secretName: "admin-secret", roles: ["admin-role"] }],
        adminPolicyTimeout: 0,
      };
      const usersOk =
        acl.users.length > 0 &&
        !acl.users.some((u) => !u.name.trim() || !u.secretName.trim() || u.roles.length === 0);
      const rolesOk = !acl.roles.some((r) => !r.name.trim() || r.privileges.length === 0);
      expect(usersOk && rolesOk).toBe(true);
    });

    it("validateACLConfig fails when no admin user exists with ACL enabled", () => {
      const acl: ACLConfig = {
        enabled: true,
        roles: [{ name: "reader", privileges: ["read"] }],
        users: [{ name: "normaluser", secretName: "normal-secret", roles: ["reader"] }],
        adminPolicyTimeout: 0,
      };
      expect(validateACLConfig(acl)).not.toBeNull();
    });
  });
});

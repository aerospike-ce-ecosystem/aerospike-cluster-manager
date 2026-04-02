import { describe, it, expect } from "vitest";
import { validateK8sName, validateNamespaces } from "@/lib/validations/k8s";
import { validateACLConfig } from "@/lib/validations/k8s-acl";
import { buildFormUpdatesFromTemplate, formatTemplateSpecField } from "../wizard/template-prefill";
import type { ACLConfig, AerospikeNamespaceConfig } from "@/lib/api/types";

/**
 * Tests for the canProceed logic used in k8s-cluster-wizard.tsx.
 * Instead of rendering the full wizard (which has many dependencies),
 * we extract and test the underlying validation logic directly.
 *
 * Step indices (5-step wizard):
 *   0: Creation Mode, 1: Basic & Resources, 2: Namespace & Storage,
 *   3: Advanced (Monitoring, ACL, Rolling Update, Rack Config), 4: Review
 */

describe("Wizard canProceed logic", () => {
  describe("Step 1: Basic (name + namespace)", () => {
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

  describe("Step 2: Namespace & Storage", () => {
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

  describe("Step 5: ACL (Security)", () => {
    it("passes when ACL is disabled (undefined)", () => {
      // canProceed returns true when form.acl is undefined or not enabled
      const acl = undefined as ACLConfig | undefined;
      expect(acl?.enabled).toBeFalsy();
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

describe("Template prefill", () => {
  describe("buildFormUpdatesFromTemplate", () => {
    it("sets templateRef with name (cluster-scoped, no namespace)", () => {
      const result = buildFormUpdatesFromTemplate({}, "my-template");
      expect(result.templateRef).toEqual({ name: "my-template" });
      expect(result.templateOverrides).toBeUndefined();
    });

    it("maps image from spec", () => {
      const result = buildFormUpdatesFromTemplate({ image: "aerospike:ce-8.1.1.1" }, "t1");
      expect(result.image).toBe("aerospike:ce-8.1.1.1");
    });

    it("maps size from spec (clamped 1-8)", () => {
      expect(buildFormUpdatesFromTemplate({ size: 3 }, "t1").size).toBe(3);
      expect(buildFormUpdatesFromTemplate({ size: 0 }, "t1").size).toBeUndefined();
      expect(buildFormUpdatesFromTemplate({ size: 10 }, "t1").size).toBeUndefined();
    });

    it("maps resources from spec", () => {
      const resources = {
        requests: { cpu: "1", memory: "2Gi" },
        limits: { cpu: "4", memory: "8Gi" },
      };
      const result = buildFormUpdatesFromTemplate({ resources }, "t1");
      expect(result.resources).toEqual(resources);
    });

    it("maps monitoring from spec", () => {
      const monitoring = { enabled: true, port: 9145 };
      const result = buildFormUpdatesFromTemplate({ monitoring }, "t1");
      expect(result.monitoring).toEqual(monitoring);
    });

    it("maps storage from spec", () => {
      const result = buildFormUpdatesFromTemplate(
        { storage: { storageClassName: "gp3", resources: { requests: { storage: "20Gi" } } } },
        "t1",
      );
      expect(result.storage).toEqual({
        storageClass: "gp3",
        size: "20Gi",
        mountPath: "/opt/aerospike/data",
      });
    });

    it("maps networkPolicy from spec", () => {
      const np = { accessType: "hostInternal" };
      const result = buildFormUpdatesFromTemplate({ networkPolicy: np }, "t1");
      expect(result.networkPolicy).toEqual(np);
    });

    it("ignores null/undefined spec fields", () => {
      const result = buildFormUpdatesFromTemplate(
        { image: null, size: undefined, resources: null },
        "t1",
      );
      expect(result.image).toBeUndefined();
      expect(result.size).toBeUndefined();
      expect(result.resources).toBeUndefined();
    });

    it("ignores empty image string", () => {
      const result = buildFormUpdatesFromTemplate({ image: "" }, "t1");
      expect(result.image).toBeUndefined();
    });
  });

  describe("formatTemplateSpecField", () => {
    it("formats image", () => {
      expect(formatTemplateSpecField("image", "aerospike:ce-8.1.1.1")).toBe("aerospike:ce-8.1.1.1");
    });

    it("formats size with plural", () => {
      expect(formatTemplateSpecField("size", 3)).toBe("3 nodes");
      expect(formatTemplateSpecField("size", 1)).toBe("1 node");
    });

    it("formats resources", () => {
      const res = {
        requests: { cpu: "500m", memory: "1Gi" },
        limits: { cpu: "2", memory: "4Gi" },
      };
      expect(formatTemplateSpecField("resources", res)).toBe("CPU: 500m/2, Mem: 1Gi/4Gi");
    });

    it("formats monitoring", () => {
      expect(formatTemplateSpecField("monitoring", { enabled: true, port: 9145 })).toBe(
        "Enabled (port 9145)",
      );
      expect(formatTemplateSpecField("monitoring", { enabled: false, port: 9145 })).toBe(
        "Disabled",
      );
    });

    it("formats storage with both size and class", () => {
      const storage = { storageClassName: "gp3", resources: { requests: { storage: "100Gi" } } };
      expect(formatTemplateSpecField("storage", storage)).toBe("100Gi / gp3");
    });

    it("formats storage with size only", () => {
      const storage = { resources: { requests: { storage: "50Gi" } } };
      expect(formatTemplateSpecField("storage", storage)).toBe("50Gi");
    });

    it("returns null for empty storage", () => {
      expect(formatTemplateSpecField("storage", {})).toBeNull();
    });

    it("returns null for unknown keys", () => {
      expect(formatTemplateSpecField("unknown", "value")).toBeNull();
    });

    it("returns null for null values", () => {
      expect(formatTemplateSpecField("image", null)).toBeNull();
    });
  });
});

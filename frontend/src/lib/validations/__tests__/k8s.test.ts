import { describe, it, expect } from "vitest";
import {
  parseCEMajorVersion,
  validateCEImage,
  validateAerospikeConfig,
  validateRackUpdate,
} from "../k8s";

describe("parseCEMajorVersion", () => {
  it("parses standard CE image tags", () => {
    expect(parseCEMajorVersion("aerospike:ce-8.1.1.1")).toBe(8);
    expect(parseCEMajorVersion("aerospike:ce-7.4.0.0")).toBe(7);
    expect(parseCEMajorVersion("aerospike:ce-10.0.0.0")).toBe(10);
  });

  it("parses images with registry prefix", () => {
    expect(parseCEMajorVersion("docker.io/aerospike:ce-8.1.1.1")).toBe(8);
    expect(parseCEMajorVersion("ghcr.io/custom/aerospike:ce-8.0.0.0")).toBe(8);
  });

  it("returns null for non-CE images", () => {
    expect(parseCEMajorVersion("aerospike:ee-8.1.1.1")).toBeNull();
    expect(parseCEMajorVersion("nginx:latest")).toBeNull();
    expect(parseCEMajorVersion("")).toBeNull();
  });
});

describe("validateCEImage", () => {
  it("accepts valid CE 8+ images", () => {
    expect(validateCEImage("aerospike:ce-8.1.1.1")).toBeNull();
    expect(validateCEImage("aerospike:ce-8.0.0.0")).toBeNull();
  });

  it("rejects CE 7.x images", () => {
    expect(validateCEImage("aerospike:ce-7.4.0.0")).toContain("not supported");
  });

  it("allows non-standard images (custom builds)", () => {
    expect(validateCEImage("my-registry/aerospike-custom:latest")).toBeNull();
  });

  it("rejects empty image", () => {
    expect(validateCEImage("")).toBe("Image is required");
    expect(validateCEImage("   ")).toBe("Image is required");
  });
});

describe("validateAerospikeConfig", () => {
  it("accepts valid CE config", () => {
    expect(validateAerospikeConfig({ service: {}, namespaces: [] })).toBeNull();
  });

  it("rejects config with xdr section", () => {
    const result = validateAerospikeConfig({ xdr: { datacenters: [] } });
    expect(result).toContain("xdr");
    expect(result).toContain("Enterprise-only");
  });

  it("rejects config with tls section", () => {
    const result = validateAerospikeConfig({ tls: [{ name: "test" }] });
    expect(result).toContain("tls");
    expect(result).toContain("Enterprise-only");
  });
});

describe("validateRackUpdate", () => {
  it("allows adding racks only", () => {
    expect(validateRackUpdate([1, 2], [1, 2, 3])).toBeNull();
  });

  it("allows removing racks only", () => {
    expect(validateRackUpdate([1, 2, 3], [1, 2])).toBeNull();
  });

  it("allows no changes", () => {
    expect(validateRackUpdate([1, 2], [1, 2])).toBeNull();
  });

  it("rejects simultaneous add and remove", () => {
    const result = validateRackUpdate([1, 2], [2, 3]);
    expect(result).toContain("Cannot add");
    expect(result).toContain("separately");
  });
});

import { describe, it, expect } from "vitest";
import { isValidCIDR } from "../network";

describe("isValidCIDR", () => {
  it("accepts valid CIDR notation", () => {
    expect(isValidCIDR("10.0.0.0/8")).toBe(true);
    expect(isValidCIDR("192.168.0.0/16")).toBe(true);
    expect(isValidCIDR("172.16.0.0/12")).toBe(true);
    expect(isValidCIDR("0.0.0.0/0")).toBe(true);
    expect(isValidCIDR("255.255.255.255/32")).toBe(true);
  });

  it("rejects invalid CIDR formats", () => {
    expect(isValidCIDR("10.0.0.0")).toBe(false);
    expect(isValidCIDR("not-a-cidr")).toBe(false);
    expect(isValidCIDR("")).toBe(false);
    expect(isValidCIDR("10.0.0/8")).toBe(false);
    expect(isValidCIDR("10.0.0.0.0/8")).toBe(false);
  });

  it("rejects octets out of range", () => {
    expect(isValidCIDR("256.0.0.0/8")).toBe(false);
    expect(isValidCIDR("10.300.0.0/8")).toBe(false);
    expect(isValidCIDR("10.0.0.999/8")).toBe(false);
  });

  it("rejects prefix out of range", () => {
    expect(isValidCIDR("10.0.0.0/33")).toBe(false);
    expect(isValidCIDR("10.0.0.0/99")).toBe(false);
  });
});

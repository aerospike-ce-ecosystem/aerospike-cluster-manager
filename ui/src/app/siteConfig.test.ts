import { describe, expect, it } from "vitest"

import { clusterSections } from "./siteConfig"

// Aerospike namespace/set names and record keys are user-controlled and may
// contain characters that are unsafe inside a URL path. The builders must
// encode each dynamic segment, otherwise a set named "a/b" adds a path
// segment and every link into it 404s.
describe("clusterSections URL builders", () => {
  it("passes through names that need no encoding", () => {
    expect(clusterSections.set("conn-1", "test", "sample_set")).toBe(
      "/clusters/conn-1/sets/test/sample_set",
    )
    expect(clusterSections.record("conn-1", "test", "sample_set", "pk-1")).toBe(
      "/clusters/conn-1/sets/test/sample_set/records/pk-1",
    )
  })

  it("encodes reserved characters in namespace, set, and key segments", () => {
    expect(clusterSections.set("conn-1", "ns/prod", "my set")).toBe(
      "/clusters/conn-1/sets/ns%2Fprod/my%20set",
    )
    expect(
      clusterSections.record("conn-1", "test", "orders", "user#42?x=1"),
    ).toBe("/clusters/conn-1/sets/test/orders/records/user%2342%3Fx%3D1")
  })

  it("round-trips a key through encode → decodeURIComponent unchanged", () => {
    const key = "región/№7 100%"
    const href = clusterSections.record("conn-1", "test", "orders", key)
    const lastSegment = href.split("/records/")[1]
    expect(decodeURIComponent(lastSegment)).toBe(key)
  })
})

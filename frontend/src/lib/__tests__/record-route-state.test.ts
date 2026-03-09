import { describe, expect, it } from "vitest";
import {
  buildCurrentListReturnTo,
  buildDefaultReturnTo,
  buildNewRecordHref,
  buildRecordDetailHref,
  buildRecordListSearchParams,
  readRecordListRouteState,
  resolveReturnTo,
} from "../record-route-state";

describe("record route state helpers", () => {
  it("round-trips page, pageSize, primaryKey, and filters", () => {
    const params = buildRecordListSearchParams({
      page: 3,
      pageSize: 50,
      primaryKey: "pk/with spaces",
      filters: {
        logic: "or",
        conditions: [
          {
            id: "cond-1",
            bin: "age",
            operator: "gt",
            value: 30,
            binType: "integer",
          },
        ],
      },
    });

    const decoded = readRecordListRouteState(params);

    expect(decoded).toEqual({
      page: 3,
      pageSize: 50,
      primaryKey: "pk/with spaces",
      filters: {
        logic: "or",
        conditions: [
          {
            id: "cond-1",
            bin: "age",
            operator: "gt",
            value: 30,
            binType: "integer",
          },
        ],
      },
    });
  });

  it("ignores malformed filters payload", () => {
    const params = new URLSearchParams({
      filters: "not-valid",
    });

    expect(readRecordListRouteState(params)).toEqual({
      page: 1,
      pageSize: 25,
      primaryKey: "",
      filters: undefined,
    });
  });

  it("builds detail href with encoded query parameters", () => {
    const href = buildRecordDetailHref({
      connId: "conn-1",
      namespace: "test",
      setName: "demo set",
      pk: "pk/1",
      intent: "edit",
      returnTo: "/browser/conn-1/test/demo%20set?page=2",
    });

    expect(href).toBe(
      "/browser/conn-1/test/demo%20set/record?pk=pk%2F1&intent=edit&returnTo=%2Fbrowser%2Fconn-1%2Ftest%2Fdemo%2520set%3Fpage%3D2",
    );
  });

  it("builds new-record href and default return target", () => {
    expect(
      buildNewRecordHref({
        connId: "conn-1",
        namespace: "test",
        setName: "demo",
        returnTo: "/browser/conn-1/test/demo?page=2",
      }),
    ).toBe(
      "/browser/conn-1/test/demo/record/new?returnTo=%2Fbrowser%2Fconn-1%2Ftest%2Fdemo%3Fpage%3D2",
    );

    expect(buildDefaultReturnTo("conn-1", "test", "demo")).toBe("/browser/conn-1/test/demo");
  });

  it("builds the current list returnTo and rejects external targets", () => {
    expect(
      buildCurrentListReturnTo("/browser/conn-1/test/demo", new URLSearchParams("page=2")),
    ).toBe("/browser/conn-1/test/demo?page=2");
    expect(resolveReturnTo("https://evil.example.com", "/browser/conn-1/test/demo")).toBe(
      "/browser/conn-1/test/demo",
    );
  });
});

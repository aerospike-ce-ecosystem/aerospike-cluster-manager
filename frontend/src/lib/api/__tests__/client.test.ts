import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "../errors";
import { api } from "../client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createResponse(status: number, body: unknown, headers?: Record<string, string>) {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: {
      get: (name: string) => headers?.[name] ?? null,
    },
    text: vi.fn().mockResolvedValue(rawBody),
    json: vi.fn().mockResolvedValue(body),
  };
}

/**
 * Helper that runs a promise expected to reject alongside fake timers.
 * Attaches a .catch() immediately so the rejection is handled before
 * vi.runAllTimersAsync() flushes microtasks, avoiding "unhandled rejection" warnings.
 */
async function expectRejection<T>(promiseFactory: () => Promise<T>): Promise<ApiError> {
  let caughtError: unknown;
  const promise = promiseFactory().catch((err) => {
    caughtError = err;
  });

  await vi.runAllTimersAsync();
  await promise;

  expect(caughtError).toBeInstanceOf(ApiError);
  return caughtError as ApiError;
}

describe("api client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useRealTimers();
  });

  describe("successful requests", () => {
    it("returns JSON data for a GET request", async () => {
      const data = [{ id: "1", name: "Test Connection" }];
      mockFetch.mockResolvedValueOnce(createResponse(200, data));

      const result = await api.getConnections();

      expect(result).toEqual(data);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;
      expect(headers.get("Content-Type")).toBeNull();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it("sends body and returns JSON for a POST request", async () => {
      const connectionData = {
        name: "New Cluster",
        hosts: ["localhost"],
        port: 3000,
        color: "#ff0000",
      };
      const responseData = {
        id: "abc",
        ...connectionData,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      };
      mockFetch.mockResolvedValueOnce(createResponse(200, responseData));

      const result = await api.createConnection(connectionData);

      expect(result).toEqual(responseData);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Headers;

      expect(url).toBe("/api/connections");
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(connectionData));
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("encodes record query parameters with special characters", async () => {
      mockFetch.mockResolvedValueOnce(
        createResponse(200, { records: [], total: 0, page: 1, pageSize: 25 }),
      );

      await api.getRecords("conn-1", "ns test", "set/a&b", 2, 10);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/records/conn-1?ns=ns+test&set=set%2Fa%26b&page=2&pageSize=10",
        expect.any(Object),
      );
    });

    it("omits optional pod logs container query parameter when undefined", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { lines: [] }));

      await api.getK8sPodLogs("team-a", "cluster-1", "pod-1", 250);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/k8s/clusters/team-a/cluster-1/pods/pod-1/logs?tail=250",
        expect.any(Object),
      );
    });

    it("encodes connection ID path segments for connection health requests", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { isConnected: true }));

      await api.getConnectionHealth("team/a connection");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/connections/team%2Fa%20connection/health",
        expect.any(Object),
      );
    });

    it("encodes pod log path segments with special characters", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { lines: [] }));

      await api.getK8sPodLogs("team/a", "cluster name", "pod#1", 100, "x/y");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/k8s/clusters/team%2Fa/cluster%20name/pods/pod%231/logs?tail=100&container=x%2Fy",
        expect.any(Object),
      );
    });

    it("returns undefined when a successful response has an empty body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await api.getConnections();

      expect(result).toBeUndefined();
    });
  });

  describe("error responses", () => {
    it("throws ApiError with correct status and message for non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(404, { message: "Connection not found" }));

      await expect(api.getConnections()).rejects.toThrow(ApiError);
    });

    it("includes status and message on ApiError", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(404, { message: "Connection not found" }));

      await expect(api.getConnections()).rejects.toMatchObject({
        message: "Connection not found",
        status: 404,
      });
    });

    it("uses statusText when error body cannot be parsed as JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: vi.fn().mockResolvedValue("{invalid"),
      });

      await expect(api.getConnections()).rejects.toMatchObject({
        message: "Forbidden",
        status: 403,
      });
    });

    it("throws a readable ApiError when a success response contains invalid JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue("{invalid"),
      });

      await expect(api.getConnections()).rejects.toMatchObject({
        message: "Invalid JSON response",
        status: 200,
      });
    });

    it("includes error code from response body", async () => {
      mockFetch.mockResolvedValueOnce(
        createResponse(422, { message: "Validation failed", code: "VALIDATION_ERROR" }),
      );

      await expect(api.getConnections()).rejects.toMatchObject({
        status: 422,
        code: "VALIDATION_ERROR",
      });
    });

    it("uses FastAPI detail string when message is missing", async () => {
      mockFetch.mockResolvedValueOnce(createResponse(401, { detail: "Not authenticated" }));

      await expect(api.getConnections()).rejects.toMatchObject({
        message: "Not authenticated",
        status: 401,
      });
    });

    it("joins validation detail list into a readable message", async () => {
      mockFetch.mockResolvedValueOnce(
        createResponse(422, {
          detail: [
            { msg: "Field required", loc: ["body", "name"] },
            { msg: "Input should be a valid integer", loc: ["body", "port"] },
          ],
        }),
      );

      await expect(api.getConnections()).rejects.toMatchObject({
        message: "Field required; Input should be a valid integer",
        status: 422,
      });
    });

    it("does NOT retry 400 Bad Request", async () => {
      mockFetch.mockResolvedValue(createResponse(400, { message: "Bad request" }));

      await expect(api.getConnections()).rejects.toMatchObject({ status: 400 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry 404 Not Found", async () => {
      mockFetch.mockResolvedValue(createResponse(404, { message: "Not found" }));

      await expect(api.getConnections()).rejects.toMatchObject({ status: 404 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry 422 Unprocessable Entity", async () => {
      mockFetch.mockResolvedValue(createResponse(422, { message: "Invalid" }));

      await expect(api.getConnections()).rejects.toMatchObject({ status: 422 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("retry behavior", () => {
    it("retries 500 errors up to MAX_RETRIES (2) times then throws", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(createResponse(500, { message: "Server error" }));

      const error = await expectRejection(() => api.getConnections());

      expect(error.status).toBe(500);
      expect(error.message).toBe("Server error");
      // 1 initial + 2 retries = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retries 429 Too Many Requests up to MAX_RETRIES times", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(createResponse(429, { message: "Rate limited" }));

      const error = await expectRejection(() => api.getConnections());

      expect(error.status).toBe(429);
      expect(error.message).toBe("Rate limited");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("retries 408 Request Timeout up to MAX_RETRIES times", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(createResponse(408, { message: "Upstream timeout" }));

      const error = await expectRejection(() => api.getConnections());

      expect(error.status).toBe(408);
      expect(error.message).toBe("Upstream timeout");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("respects Retry-After header delay for retryable responses", async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      mockFetch
        .mockResolvedValueOnce(
          createResponse(429, { message: "Rate limited" }, { "Retry-After": "3" }),
        )
        .mockResolvedValueOnce(createResponse(200, [{ id: "1" }]));

      const promise = api.getConnections();
      await vi.runAllTimersAsync();
      await promise;

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
    });

    it("retries 502 Bad Gateway", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(createResponse(502, { message: "Bad gateway" }));

      const error = await expectRejection(() => api.getConnections());

      expect(error.status).toBe(502);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("succeeds on retry after initial 5xx failure", async () => {
      vi.useFakeTimers();
      const data = [{ id: "1" }];
      mockFetch
        .mockResolvedValueOnce(createResponse(503, { message: "Unavailable" }))
        .mockResolvedValueOnce(createResponse(200, data));

      let result: unknown;
      const promise = api.getConnections().then((res) => {
        result = res;
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(result).toEqual(data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry POST requests on 5xx responses", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(createResponse(503, { message: "Unavailable" }));

      await expect(
        api.createConnection({
          name: "cluster",
          hosts: ["127.0.0.1"],
          port: 3000,
          color: "#000000",
        }),
      ).rejects.toMatchObject({
        status: 503,
        message: "Unavailable",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout", () => {
    it("throws ApiError with status 408 on timeout", async () => {
      vi.useFakeTimers();

      mockFetch.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      // getConnectionHealth uses a 10_000ms timeout
      const error = await expectRejection(() => api.getConnectionHealth("test-id"));

      expect(error.message).toBe("Request timed out");
      expect(error.status).toBe(408);
    });
  });

  describe("network errors", () => {
    it("throws ApiError with status 0 after exhausting retries on network failure", async () => {
      vi.useFakeTimers();
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      const error = await expectRejection(() => api.getConnections());

      expect(error.status).toBe(0);
      // 1 initial + 2 retries = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("recovers on retry after transient network error", async () => {
      vi.useFakeTimers();
      const data = [{ id: "1" }];
      mockFetch
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(createResponse(200, data));

      let result: unknown;
      const promise = api.getConnections().then((res) => {
        result = res;
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(result).toEqual(data);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry POST requests on network failure", async () => {
      vi.useFakeTimers();
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        api.createConnection({
          name: "cluster",
          hosts: ["127.0.0.1"],
          port: 3000,
          color: "#000000",
        }),
      ).rejects.toMatchObject({
        status: 0,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});

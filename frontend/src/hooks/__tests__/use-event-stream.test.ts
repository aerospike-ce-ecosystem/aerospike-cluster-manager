import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEventStream } from "../use-event-stream";
import type { SSEEventType } from "@/lib/api/types";

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  readyState = 0;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Auto-connect after microtask
    queueMicrotask(() => {
      if (!this.closed) {
        this.readyState = 1;
        this.onopen?.();
      }
    });
  }

  addEventListener(type: string, handler: (e: { data: string }) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener() {
    // no-op for tests
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  // Test helper: simulate receiving an event
  simulateEvent(type: string, data: unknown) {
    const handlers = this.listeners[type] || [];
    for (const handler of handlers) {
      handler({ data: JSON.stringify(data) });
    }
  }

  // Test helper: simulate error
  simulateError() {
    this.onerror?.();
  }
}

describe("useEventStream", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates EventSource and connects", async () => {
    const onEvent = vi.fn();
    const eventTypes: SSEEventType[] = ["cluster.metrics"];

    renderHook(() => useEventStream({ eventTypes, onEvent }));

    // Allow microtasks to run
    await vi.advanceTimersByTimeAsync(0);

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("/api/v1/events/stream");
    expect(MockEventSource.instances[0].url).toContain("types=cluster.metrics");
  });

  it("calls onEvent when an event is received", async () => {
    const onEvent = vi.fn();
    const eventTypes: SSEEventType[] = ["cluster.metrics"];

    renderHook(() => useEventStream({ eventTypes, onEvent }));
    await vi.advanceTimersByTimeAsync(0);

    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateEvent("cluster.metrics", { connectionId: "test", value: 42 });
    });

    expect(onEvent).toHaveBeenCalledWith({
      event: "cluster.metrics",
      data: { connectionId: "test", value: 42 },
    });
  });

  it("closes EventSource on unmount", async () => {
    const onEvent = vi.fn();
    const eventTypes: SSEEventType[] = ["cluster.metrics"];

    const { unmount } = renderHook(() => useEventStream({ eventTypes, onEvent }));
    await vi.advanceTimersByTimeAsync(0);

    const es = MockEventSource.instances[0];
    expect(es.closed).toBe(false);

    unmount();
    expect(es.closed).toBe(true);
  });

  it("does not connect when disabled", async () => {
    const onEvent = vi.fn();
    const eventTypes: SSEEventType[] = ["cluster.metrics"];

    renderHook(() => useEventStream({ eventTypes, onEvent, enabled: false }));
    await vi.advanceTimersByTimeAsync(0);

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("returns disconnected status when disabled", async () => {
    const onEvent = vi.fn();
    const eventTypes: SSEEventType[] = ["cluster.metrics"];

    const { result } = renderHook(() =>
      useEventStream({ eventTypes, onEvent, enabled: false }),
    );

    expect(result.current.status).toBe("disconnected");
    expect(result.current.fallbackToPolling).toBe(false);
  });
});

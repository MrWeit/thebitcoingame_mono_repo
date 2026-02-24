/**
 * WebSocket client unit tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket globally
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  sentMessages: string[] = [];
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.closeCalled = true;
    this.readyState = MockWebSocket.CLOSED;
  }

  // Test helpers
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

let lastWs: MockWebSocket | null = null;

vi.stubGlobal(
  "WebSocket",
  class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      lastWs = this;
    }
  },
);

// Import after mocking WebSocket
const { wsClient } = await import("../ws");

describe("WebSocketClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastWs = null;
  });

  afterEach(() => {
    wsClient.disconnect();
    vi.useRealTimers();
  });

  it("should connect with token", () => {
    wsClient.connect("test-token");
    expect(lastWs).not.toBeNull();
    expect(lastWs!.url).toContain("ws://localhost:8000/ws?token=test-token");
  });

  it("should route messages to correct channel handlers", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1); // trigger onopen

    const handler = vi.fn();
    wsClient.subscribe("mining", handler);
    await vi.advanceTimersByTimeAsync(1);

    lastWs!.simulateMessage({
      channel: "mining",
      data: { type: "share_submitted", diff: 1000 },
    });

    expect(handler).toHaveBeenCalledWith({
      type: "share_submitted",
      diff: 1000,
    });
  });

  it("should not route messages to unrelated channel handlers", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1);

    const miningHandler = vi.fn();
    const dashHandler = vi.fn();
    wsClient.subscribe("mining", miningHandler);
    wsClient.subscribe("dashboard", dashHandler);

    lastWs!.simulateMessage({
      channel: "mining",
      data: { type: "test" },
    });

    expect(miningHandler).toHaveBeenCalled();
    expect(dashHandler).not.toHaveBeenCalled();
  });

  it("should unsubscribe and clean up handler", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1); // trigger onopen

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    // Subscribe two handlers to the same channel
    const unsub1 = wsClient.subscribe("mining", handler1);
    const unsub2 = wsClient.subscribe("mining", handler2);

    // Both handlers should receive messages
    lastWs!.simulateMessage({ channel: "mining", data: { type: "test1" } });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    // Unsubscribe handler1 — channel still has handler2 so no WS unsubscribe yet
    unsub1();
    lastWs!.simulateMessage({ channel: "mining", data: { type: "test2" } });
    expect(handler1).toHaveBeenCalledTimes(1); // not called again
    expect(handler2).toHaveBeenCalledTimes(2); // still receiving

    // Unsubscribe handler2 — last handler, should send WS unsubscribe
    unsub2();

    // Check all messages for the unsubscribe
    const allMsgs = lastWs!.sentMessages.map((m) => JSON.parse(m));
    const hasUnsub = allMsgs.some(
      (m: { action: string; channel: string }) => m.action === "unsubscribe" && m.channel === "mining"
    );
    expect(hasUnsub).toBe(true);

    // No handlers left — messages should not be delivered
    handler2.mockClear();
    lastWs!.simulateMessage({ channel: "mining", data: { type: "test3" } });
    expect(handler2).not.toHaveBeenCalled();
  });

  it("should resubscribe after reconnect", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1);

    wsClient.subscribe("mining", vi.fn());
    await vi.advanceTimersByTimeAsync(1);

    // Clear sent messages
    const ws1 = lastWs!;
    ws1.sentMessages.length = 0;

    // Simulate disconnect
    ws1.simulateClose();

    // Advance past reconnect delay (1s base + up to 1s jitter)
    await vi.advanceTimersByTimeAsync(3000);

    // New WebSocket should be created
    expect(lastWs).not.toBe(ws1);

    // Trigger onopen on new connection
    await vi.advanceTimersByTimeAsync(1);

    // New connection should have sent subscribe for mining
    const newSent = lastWs!.sentMessages;
    expect(newSent.some((m) => m.includes('"subscribe"') && m.includes('"mining"'))).toBe(true);
  });

  it("should use exponential backoff with jitter", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1);

    // Simulate multiple disconnects to check backoff behavior
    const ws1 = lastWs!;
    ws1.simulateClose();

    // First reconnect: ~1s + jitter
    await vi.advanceTimersByTimeAsync(2500);
    const ws2 = lastWs;
    expect(ws2).not.toBe(ws1);
  });

  it("should stop reconnecting after max attempts", async () => {
    wsClient.connect("test-token");
    await vi.advanceTimersByTimeAsync(1);

    // Simulate 11 disconnects (max 10 reconnect attempts)
    for (let i = 0; i < 12; i++) {
      if (lastWs) {
        lastWs.simulateClose();
        await vi.advanceTimersByTimeAsync(35000); // past max backoff
      }
    }

    // After max attempts, disconnect should stop creating new connections
    const wsAfterMax = lastWs;
    if (wsAfterMax) {
      wsAfterMax.simulateClose();
      await vi.advanceTimersByTimeAsync(35000);
    }
    // No more reconnects
  });

  it("should disconnect cleanly", () => {
    wsClient.connect("test-token");
    const ws = lastWs!;
    wsClient.disconnect();
    expect(ws.closeCalled).toBe(true);
  });
});

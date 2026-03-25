import { WS_CHANNELS } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WsTransport } from "./wsTransport";

type WsEventType = "open" | "message" | "close" | "error";
type WsListener = (event?: { data?: unknown; type?: string }) => void;

const sockets: MockWebSocket[] = [];

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<WsEventType, Set<WsListener>>();

  constructor(_url: string) {
    sockets.push(this);
  }

  addEventListener(type: WsEventType, listener: WsListener) {
    const listeners = this.listeners.get(type) ?? new Set<WsListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close");
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  serverMessage(data: unknown) {
    this.emit("message", { data });
  }

  emitError() {
    this.emit("error", { type: "error" });
  }

  private emit(type: WsEventType, event?: { data?: unknown; type?: string }) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }
}

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WsTransport reconnect", () => {
  it("reconnects after close and accepts new requests", async () => {
    const transport = new WsTransport({
      url: "ws://localhost:3020",
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });
    sockets[0]?.open();

    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(sockets).toHaveLength(2);
    sockets[1]?.open();

    const requestPromise = transport.request("projects.list");
    const sent = sockets[1]?.sent.at(-1);
    const requestEnvelope = JSON.parse(sent ?? "{}") as { id: string };
    sockets[1]?.serverMessage(
      JSON.stringify({
        id: requestEnvelope.id,
        result: { projects: [] },
      }),
    );

    await expect(requestPromise).resolves.toEqual({ projects: [] });
    expect(transport.getState()).toBe("open");

    transport.dispose();
  });

  it("replays the latest push to new subscribers", () => {
    const transport = new WsTransport({
      url: "ws://localhost:3020",
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
    });
    sockets[0]?.open();
    sockets[0]?.serverMessage(
      JSON.stringify({
        type: "push",
        sequence: 1,
        channel: WS_CHANNELS.serverConfigUpdated,
        data: { issues: [], providers: [] },
      }),
    );

    const listener = vi.fn();
    transport.subscribe(WS_CHANNELS.serverConfigUpdated, listener, { replayLatest: true });

    expect(listener).toHaveBeenCalledTimes(1);
    transport.dispose();
  });
});

import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAttachedServerConnection, startServerSupervisor } from "./serverSupervisor";

class FakeChildProcess extends EventEmitter {
  killed = false;
  kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.killed = true;
    return signal !== undefined;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("startServerSupervisor", () => {
  it("resolves attach-only server config from env", () => {
    expect(
      resolveAttachedServerConnection({
        T3CODE_TUI_ATTACH_ONLY: "1",
        T3CODE_HOST: "127.0.0.1",
        T3CODE_PORT: "43111",
        T3CODE_AUTH_TOKEN: "token-1",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 43111,
      authToken: "token-1",
      wsUrl: "ws://127.0.0.1:43111/?token=token-1",
    });
  });

  it("requires port and auth token for attach-only mode", () => {
    expect(() =>
      resolveAttachedServerConnection({
        T3CODE_TUI_ATTACH_ONLY: "1",
        T3CODE_AUTH_TOKEN: "token-1",
      }),
    ).toThrow("T3CODE_TUI_ATTACH_ONLY requires a valid T3CODE_PORT.");

    expect(() =>
      resolveAttachedServerConnection({
        T3CODE_TUI_ATTACH_ONLY: "1",
        T3CODE_PORT: "43111",
      }),
    ).toThrow("T3CODE_TUI_ATTACH_ONLY requires T3CODE_AUTH_TOKEN.");
  });

  it("uses the configured T3CODE port and injects normalized child env", async () => {
    const children: FakeChildProcess[] = [];
    const spawnImpl = vi.fn(() => {
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });

    const server = await startServerSupervisor(
      { homeDir: "/tmp/.t1", authToken: "token-1" },
      {
        spawnImpl,
        reservePort: async () => 43111,
        waitUntilReady: async () => undefined,
        env: {
          T3CODE_PORT: "49999",
          T3CODE_HOST: "127.0.0.1",
        },
      },
    );

    expect(server.port).toBe(49999);
    expect(server.wsUrl).toBe("ws://127.0.0.1:49999/?token=token-1");
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect((spawnImpl as any).mock.calls[0][0]).toBe("bun");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("49999");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("--auto-bootstrap-project-from-cwd");
    expect((spawnImpl as any).mock.calls[0][2].env.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD).toBe(
      "true",
    );
    expect((spawnImpl as any).mock.calls[0][2].env.T3CODE_PORT).toBe("49999");

    server.stop();
    expect(children[0]?.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("trims host and validates T3CODE_PORT before spawning", async () => {
    const spawnImpl = vi.fn(() => new FakeChildProcess() as unknown as ChildProcess);

    await expect(
      startServerSupervisor(
        { homeDir: "/tmp/.t1", authToken: "token-1" },
        {
          spawnImpl,
          waitUntilReady: async () => undefined,
          env: {
            T3CODE_HOST: " 127.0.0.1 ",
            T3CODE_PORT: "nope",
          },
        },
      ),
    ).rejects.toThrow("T3CODE_PORT must be a valid port between 1 and 65535.");

    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("uses trimmed host and configured env port when valid", async () => {
    const children: FakeChildProcess[] = [];
    const spawnImpl = vi.fn(() => {
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });

    const server = await startServerSupervisor(
      { homeDir: "/tmp/.t1", authToken: "token-4" },
      {
        spawnImpl,
        reservePort: async () => 49999,
        waitUntilReady: async () => undefined,
        env: {
          T3CODE_HOST: " 127.0.0.1 ",
          T3CODE_PORT: " 43114 ",
        },
      },
    );

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBe(43114);
    expect(server.wsUrl).toBe("ws://127.0.0.1:43114/?token=token-4");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("127.0.0.1");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("43114");

    server.stop();
    expect(children[0]?.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("uses node for packaged production server launches", async () => {
    const spawnImpl = vi.fn(() => new FakeChildProcess() as unknown as ChildProcess);

    const server = await startServerSupervisor(
      { homeDir: "/tmp/.t1", authToken: "token-5" },
      {
        spawnImpl,
        reservePort: async () => 43115,
        waitUntilReady: async () => undefined,
        env: {
          NODE_ENV: "production",
        },
      },
    );

    expect((spawnImpl as any).mock.calls[0][0]).toMatch(/(^|\/)node$/);
    expect((spawnImpl as any).mock.calls[0][1][0]).toContain("/apps/server/dist/index.mjs");

    server.stop();
  });

  it("restarts the child after an unexpected exit", async () => {
    vi.useFakeTimers();
    const children: FakeChildProcess[] = [];
    const onRestart = vi.fn();
    const spawnImpl = vi.fn(() => {
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });

    const server = await startServerSupervisor(
      {
        homeDir: "/tmp/.t1",
        port: 43112,
        authToken: "token-2",
        restartDelayMs: 25,
        onRestart,
      },
      {
        spawnImpl,
        waitUntilReady: async () => undefined,
        env: {},
      },
    );

    children[0]?.emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(25);

    expect(onRestart).toHaveBeenCalledWith({ attempt: 1 });
    expect(spawnImpl).toHaveBeenCalledTimes(2);
    expect(server.process).toBe(children[1]);

    server.stop();
  });

  it("does not restart after stop is called", async () => {
    vi.useFakeTimers();
    const children: FakeChildProcess[] = [];
    const spawnImpl = vi.fn(() => {
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });

    const server = await startServerSupervisor(
      {
        homeDir: "/tmp/.t1",
        port: 43113,
        authToken: "token-3",
        restartDelayMs: 25,
      },
      {
        spawnImpl,
        waitUntilReady: async () => undefined,
        env: {},
      },
    );

    server.stop();
    children[0]?.emit("exit", 0, "SIGTERM");
    await vi.advanceTimersByTimeAsync(25);

    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });
});

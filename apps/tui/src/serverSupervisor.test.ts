import fs from "node:fs";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAttachedServerConnection, startServerSupervisor } from "./serverSupervisor";

const expectedPackagedBunCommand = () => (process.versions.bun ? process.execPath : "bun");

class FakeChildProcess extends EventEmitter {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
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
        T1CODE_TUI_ATTACH_ONLY: "1",
        T1CODE_HOST: "127.0.0.1",
        T1CODE_PORT: "43111",
        T1CODE_AUTH_TOKEN: "token-1",
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
        T1CODE_TUI_ATTACH_ONLY: "1",
        T1CODE_AUTH_TOKEN: "token-1",
      }),
    ).toThrow("T1CODE_TUI_ATTACH_ONLY requires a valid T1CODE_PORT.");

    expect(() =>
      resolveAttachedServerConnection({
        T1CODE_TUI_ATTACH_ONLY: "1",
        T1CODE_PORT: "43111",
      }),
    ).toThrow("T1CODE_TUI_ATTACH_ONLY requires T1CODE_AUTH_TOKEN.");
  });

  it("ignores ambient T1CODE server env when launching a managed child", async () => {
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
          T1CODE_PORT: "49999",
          T1CODE_HOST: "127.0.0.1",
        },
      },
    );

    expect(server.port).toBe(43111);
    expect(server.host).toBe("127.0.0.1");
    expect(server.wsUrl).toBe("ws://127.0.0.1:43111/?token=token-1");
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect((spawnImpl as any).mock.calls[0][0]).toBe("bun");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("43111");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("--auto-bootstrap-project-from-cwd");
    expect((spawnImpl as any).mock.calls[0][2].env.T1CODE_PORT).toBeUndefined();
    expect((spawnImpl as any).mock.calls[0][2].env.T1CODE_AUTH_TOKEN).toBeUndefined();
    expect((spawnImpl as any).mock.calls[0][2].env.T1CODE_TUI_ATTACH_ONLY).toBeUndefined();

    server.stop();
    expect(children[0]?.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not validate ambient T1CODE_PORT when launching a managed child", async () => {
    const spawnImpl = vi.fn(() => new FakeChildProcess() as unknown as ChildProcess);

    const server = await startServerSupervisor(
      { homeDir: "/tmp/.t1", authToken: "token-1" },
      {
        spawnImpl,
        reservePort: async () => 43112,
        waitUntilReady: async () => undefined,
        env: {
          T1CODE_HOST: " 127.0.0.1 ",
          T1CODE_PORT: "nope",
        },
      },
    );

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBe(43112);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect((spawnImpl as any).mock.calls[0][1]).toContain("43112");

    server.stop();
  });

  it("uses explicit options over ambient T1CODE server env when valid", async () => {
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
          T1CODE_HOST: " 127.0.0.1 ",
          T1CODE_PORT: " 43114 ",
        },
      },
    );

    expect(server.host).toBe("127.0.0.1");
    expect(server.port).toBe(49999);
    expect(server.wsUrl).toBe("ws://127.0.0.1:49999/?token=token-4");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("127.0.0.1");
    expect((spawnImpl as any).mock.calls[0][1]).toContain("49999");

    server.stop();
    expect(children[0]?.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("uses Bun for packaged production server launches", async () => {
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

    expect((spawnImpl as any).mock.calls[0][0]).toBe(expectedPackagedBunCommand());
    expect((spawnImpl as any).mock.calls[0][1][0]).toContain("/apps/server/dist/index.mjs");

    server.stop();
  });

  it("prefers the packaged bundled server entry when present", async () => {
    const spawnImpl = vi.fn(() => new FakeChildProcess() as unknown as ChildProcess);
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const server = await startServerSupervisor(
      { homeDir: "/tmp/.t1", authToken: "token-6" },
      {
        spawnImpl,
        reservePort: async () => 43116,
        waitUntilReady: async () => undefined,
        env: {
          NODE_ENV: "production",
        },
      },
    );

    expect((spawnImpl as any).mock.calls[0][0]).toBe(expectedPackagedBunCommand());
    expect((spawnImpl as any).mock.calls[0][1][0]).toContain("/server/index.js");

    server.stop();
    existsSyncSpy.mockRestore();
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

  it("stops restarting and surfaces a fatal startup permission error", async () => {
    vi.useFakeTimers();
    const children: FakeChildProcess[] = [];
    const onRestart = vi.fn();
    const spawnImpl = vi.fn(() => {
      const child = new FakeChildProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });

    await expect(
      startServerSupervisor(
        {
          homeDir: "/tmp/.t1",
          port: 43117,
          authToken: "token-7",
          restartDelayMs: 25,
          onRestart,
        },
        {
          spawnImpl,
          waitUntilReady: async ({ process }) => {
            const child = process as unknown as FakeChildProcess & {
              stdout?: EventEmitter;
            };
            child.stdout?.emit(
              "data",
              "Error: EACCES: permission denied, mkdir '/tmp/.t1/userdata/logs'",
            );
            child.emit("exit", 1, null);
            throw new Error("Server exited before becoming ready (1).");
          },
          env: {},
        },
      ),
    ).rejects.toThrow("T1Code could not start because a required path is not writable.");

    await vi.advanceTimersByTimeAsync(25);

    expect(onRestart).not.toHaveBeenCalled();
    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });
});

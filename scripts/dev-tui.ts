#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SERVER_ENTRY = path.join(REPO_ROOT, "apps/server/src/index.ts");
const TUI_ENTRY = path.join(REPO_ROOT, "apps/tui/src/index.tsx");

function resolveTuiPaths(env: NodeJS.ProcessEnv = process.env): {
  homeDir: string;
  configHomeDir: string;
} {
  return {
    homeDir: env.T3CODE_HOME?.trim() || path.join(os.homedir(), ".t1"),
    configHomeDir: env.T3CODE_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config", "t1code"),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLogLine(stream: fs.WriteStream, event: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  stream.write(`${new Date().toISOString()} ${event}${suffix}\n`);
}

async function reserveLoopbackPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve loopback port.")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForPort(
  host: string,
  port: number,
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`T3 server exited before becoming ready (${child.exitCode}).`);
    }

    const isReady = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const finish = (ready: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(ready);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });

    if (isReady) {
      return;
    }

    await wait(100);
  }

  throw new Error(`Timed out waiting for T3 server on ${host}:${port}.`);
}

const paths = resolveTuiPaths();
const host = process.env.T3CODE_HOST?.trim() || "127.0.0.1";
const port = process.env.T3CODE_PORT
  ? Number(process.env.T3CODE_PORT)
  : await reserveLoopbackPort();
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("T3CODE_PORT must be a valid port when provided.");
}
const authToken = process.env.T3CODE_AUTH_TOKEN?.trim() || randomBytes(16).toString("hex");

const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  T3CODE_MODE: "tui",
  T3CODE_HOME: paths.homeDir,
  T3CODE_HOST: host,
  T3CODE_PORT: String(port),
  T3CODE_AUTH_TOKEN: authToken,
  T3CODE_NO_BROWSER: "1",
  T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "true",
};

await fs.promises.mkdir(paths.configHomeDir, { recursive: true });
const logStream = fs.createWriteStream(path.join(paths.configHomeDir, "tui.log"), {
  flags: "a",
});

const server = spawn(
  "bun",
  [
    "run",
    SERVER_ENTRY,
    "--mode",
    "tui",
    "--auto-bootstrap-project-from-cwd",
    "--host",
    host,
    "--port",
    String(port),
    "--auth-token",
    authToken,
    "--home-dir",
    paths.homeDir,
    "--no-browser",
  ],
  {
    cwd: REPO_ROOT,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

appendLogLine(logStream, "dev-tui.server.spawned", { host, port, pid: server.pid ?? null });
server.stdout?.on("data", (chunk) => {
  appendLogLine(logStream, "dev-tui.server.stdout", { chunk: String(chunk).trimEnd() });
});
server.stderr?.on("data", (chunk) => {
  appendLogLine(logStream, "dev-tui.server.stderr", { chunk: String(chunk).trimEnd() });
});

await waitForPort(host, port, server, 10_000);

const tui = spawn("bun", ["--silent", "--watch", "run", TUI_ENTRY], {
  cwd: REPO_ROOT,
  env: {
    ...process.env,
    T3CODE_MODE: "tui",
    T3CODE_HOME: paths.homeDir,
    T3CODE_HOST: host,
    T3CODE_PORT: String(port),
    T3CODE_AUTH_TOKEN: authToken,
    T3CODE_NO_BROWSER: "1",
    T3CODE_TUI_ATTACH_ONLY: "1",
  },
  stdio: "inherit",
});

let shuttingDown = false;

function terminateChild(child: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM") {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  child.kill(signal);
}

function normalizeExitCode(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function shutdown(signal?: NodeJS.Signals, exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  terminateChild(tui, signal);
  terminateChild(server, signal);
  process.exitCode = exitCode;
  setTimeout(() => {
    terminateChild(tui, "SIGKILL");
    terminateChild(server, "SIGKILL");
    process.exit(process.exitCode ?? exitCode);
  }, 1_500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.once("exit", (code, signal) => {
  appendLogLine(logStream, "dev-tui.server.exit", { code: code ?? null, signal: signal ?? null });
  if (shuttingDown) {
    return;
  }
  appendLogLine(logStream, "dev-tui.server.unexpected-exit", {
    code: code ?? null,
    signal: signal ?? null,
  });
  shutdown(undefined, code ?? 1);
});

tui.once("exit", (code, signal) => {
  appendLogLine(logStream, "dev-tui.tui.exit", { code: code ?? null, signal: signal ?? null });
  if (shuttingDown) {
    shutdown(undefined, normalizeExitCode(process.exitCode ?? code));
    return;
  }
  shutdown(signal ?? undefined, normalizeExitCode(code));
});

process.once("exit", () => {
  logStream.end();
});

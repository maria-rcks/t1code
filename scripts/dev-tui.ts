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
const MAX_STARTUP_ERROR_LINES = 10;

function resolveTuiPaths(env: NodeJS.ProcessEnv = process.env): {
  homeDir: string;
  configHomeDir: string;
} {
  return {
    homeDir: env.T1CODE_HOME?.trim() || path.join(os.homedir(), ".t1"),
    configHomeDir: env.T1CODE_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config", "t1code"),
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLogLine(stream: fs.WriteStream, event: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  stream.write(`${new Date().toISOString()} ${event}${suffix}\n`);
}

function ensureDependenciesInstalled(repoRoot: string) {
  if (fs.existsSync(path.join(repoRoot, "node_modules"))) {
    return;
  }

  throw new Error(
    `Dependencies are not installed. Run \`bun install\` in ${repoRoot} before starting the TUI.`,
  );
}

function recordStartupError(buffer: Array<string>, chunk: string) {
  const lines = chunk
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  buffer.push(...lines);
  if (buffer.length > MAX_STARTUP_ERROR_LINES) {
    buffer.splice(0, buffer.length - MAX_STARTUP_ERROR_LINES);
  }
}

function formatStartupFailureMessage(options: {
  exitCode: number;
  host: string;
  port: number;
  logPath: string;
  recentErrors: ReadonlyArray<string>;
  timedOut?: boolean;
}): string {
  const { exitCode, host, port, logPath, recentErrors, timedOut = false } = options;
  const lastError = recentErrors.at(-1);
  const recentErrorSummary = lastError ? ` Last server error: ${lastError}` : "";
  const installHint =
    lastError && /cannot find module|module not found/iu.test(lastError)
      ? " Dependencies may not be installed. Run `bun install` from the repo root and try again."
      : "";

  if (timedOut) {
    return `Timed out waiting for the T1 server on ${host}:${port}.${recentErrorSummary}${installHint} See ${logPath} for full logs.`;
  }

  return `T1 server exited before becoming ready (${exitCode}).${recentErrorSummary}${installHint} See ${logPath} for full logs.`;
}

function stripReservedLaunchEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith("T1CODE_") && !key.startsWith("T3CODE_")),
  );
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
  options: {
    logPath: string;
    recentErrors: ReadonlyArray<string>;
  },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        formatStartupFailureMessage({
          exitCode: child.exitCode,
          host,
          port,
          logPath: options.logPath,
          recentErrors: options.recentErrors,
        }),
      );
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

  throw new Error(
    formatStartupFailureMessage({
      exitCode: child.exitCode ?? 0,
      host,
      port,
      logPath: options.logPath,
      recentErrors: options.recentErrors,
      timedOut: true,
    }),
  );
}

ensureDependenciesInstalled(REPO_ROOT);

const paths = resolveTuiPaths();
const host = process.env.T1CODE_HOST?.trim() || "127.0.0.1";
const port = process.env.T1CODE_PORT
  ? Number(process.env.T1CODE_PORT)
  : await reserveLoopbackPort();
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error("T1CODE_PORT must be a valid port when provided.");
}
const authToken = process.env.T1CODE_AUTH_TOKEN?.trim() || randomBytes(16).toString("hex");

await fs.promises.mkdir(paths.configHomeDir, { recursive: true });
const logPath = path.join(paths.configHomeDir, "tui.log");
const startupErrors: Array<string> = [];
const logStream = fs.createWriteStream(logPath, {
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
    env: stripReservedLaunchEnv(process.env),
    stdio: ["ignore", "pipe", "pipe"],
  },
);

appendLogLine(logStream, "dev-tui.server.spawned", { host, port, pid: server.pid ?? null });
server.stdout?.on("data", (chunk) => {
  appendLogLine(logStream, "dev-tui.server.stdout", { chunk: String(chunk).trimEnd() });
});
server.stderr?.on("data", (chunk) => {
  const output = String(chunk).trimEnd();
  appendLogLine(logStream, "dev-tui.server.stderr", { chunk: output });
  recordStartupError(startupErrors, output);
});

await waitForPort(host, port, server, 10_000, { logPath, recentErrors: startupErrors });

const tui = spawn("bun", ["--silent", "--watch", "run", TUI_ENTRY], {
  cwd: REPO_ROOT,
  env: {
    ...stripReservedLaunchEnv(process.env),
    T1CODE_HOME: paths.homeDir,
    T1CODE_CONFIG_HOME: paths.configHomeDir,
    T1CODE_HOST: host,
    T1CODE_PORT: String(port),
    T1CODE_AUTH_TOKEN: authToken,
    T1CODE_TUI_ATTACH_ONLY: "1",
    ...(process.env.T1CODE_CHAT_MODE ? { T1CODE_CHAT_MODE: process.env.T1CODE_CHAT_MODE } : {}),
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

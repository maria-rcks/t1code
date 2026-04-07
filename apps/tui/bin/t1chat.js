#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const entryPath = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));

function printError(error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
}

process.env.T1CODE_CHAT_MODE = "1";

if (process.versions.bun === undefined) {
  const bunBin = process.env.T1CODE_BUN_BIN?.trim() || "bun";
  const child = spawn(bunBin, [entryPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.once("error", (error) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      printError("t1code requires Bun on your PATH to launch the TUI runtime.");
      process.exit(1);
      return;
    }
    printError(error);
    process.exit(1);
  });
} else {
  import("../dist/index.mjs").catch((error) => {
    printError(error);
    process.exit(1);
  });
}

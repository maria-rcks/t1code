import fs from "node:fs/promises";
import path from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import React from "react";
import { resolveTuiPaths } from "./config";
import { readPrefs } from "./prefs";
import { App } from "./ui";

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function terminalIdentity(env: NodeJS.ProcessEnv = process.env): string {
  return [env.TERM_PROGRAM, env.TERM, env.COLORTERM].filter(Boolean).join(" ").toLowerCase();
}

function shouldUseKittyKeyboard(env: NodeJS.ProcessEnv = process.env): boolean {
  const forced = readBooleanEnv(env.T3CODE_USE_KITTY_KEYBOARD);
  if (forced !== undefined) return forced;
  const identity = terminalIdentity(env);
  return ["ghostty", "kitty", "wezterm", "iterm"].some((token) => identity.includes(token));
}

function shouldUseAlternateScreen(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T3CODE_USE_ALTERNATE_SCREEN) ?? true;
}

function shouldUseMouse(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T3CODE_USE_MOUSE) ?? true;
}

function shouldEnableMouseMovement(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T3CODE_ENABLE_MOUSE_MOVEMENT) ?? false;
}

if (process.env.T3CODE_HEADLESS === "1") {
  const paths = resolveTuiPaths();
  const outputPath =
    process.env.T3CODE_HEADLESS_FRAME_PATH?.trim() ||
    path.join(paths.configHomeDir, "headless-frame.txt");
  const timeoutMs = Number(process.env.T3CODE_HEADLESS_TIMEOUT_MS ?? 1_500);
  const width = Number(process.env.T3CODE_HEADLESS_WIDTH ?? 160);
  const height = Number(process.env.T3CODE_HEADLESS_HEIGHT ?? 48);
  const testSetup = await createTestRenderer({
    width,
    height,
    kittyKeyboard: true,
  });
  const root = createRoot(testSetup.renderer);
  root.render(<App renderer={testSetup.renderer} />);

  setTimeout(() => {
    void (async () => {
      await testSetup.renderOnce();
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, testSetup.captureCharFrame(), "utf8");
      root.unmount();
      testSetup.renderer.destroy();
      process.stdout.write(`Headless frame written to ${outputPath}\n`);
      process.exit(0);
    })();
  }, timeoutMs);
} else {
  let shuttingDown = false;
  const paths = resolveTuiPaths();
  const prefs = await readPrefs(paths);
  const rendererBackgroundColor = prefs.appSettings?.theme === "light" ? "#f5f5f5" : "#171717";
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useAlternateScreen: shouldUseAlternateScreen(),
    useMouse: shouldUseMouse(),
    enableMouseMovement: shouldEnableMouseMovement(),
    useKittyKeyboard: shouldUseKittyKeyboard() ? { events: true } : null,
    backgroundColor: rendererBackgroundColor,
  });
  const root = createRoot(renderer);

  const shutdown = (code = 0, error?: unknown) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      root.unmount();
    } catch {}
    try {
      renderer.destroy();
    } catch {}
    if (error) {
      process.stderr.write(
        `t1 tui shutdown after error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exitCode = code || 1;
    } else {
      process.exitCode = code;
    }
    setTimeout(() => {
      process.exit(process.exitCode ?? code);
    }, 50).unref();
  };

  const signalHandlers = [
    ["SIGINT", () => shutdown(0)],
    ["SIGTERM", () => shutdown(0)],
    ["SIGHUP", () => shutdown(0)],
    ["uncaughtException", (error: unknown) => shutdown(1, error)],
    ["unhandledRejection", (error: unknown) => shutdown(1, error)],
  ] as const;

  for (const [event, handler] of signalHandlers) {
    process.on(event, handler);
  }

  renderer.once("destroy", () => {
    for (const [event, handler] of signalHandlers) {
      process.off(event, handler);
    }
  });

  root.render(<App renderer={renderer} onRequestExit={() => shutdown(0)} />);
}

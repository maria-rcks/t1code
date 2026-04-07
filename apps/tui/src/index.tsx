import fs from "node:fs/promises";
import path from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import React from "react";
import { DEFAULT_APP_THEME } from "@t3tools/client-core";
import { resolveTuiPaths } from "./config";
import { readPrefs } from "./prefs";
import {
  normalizeRendererThemeMode,
  resolveTerminalPalette,
  shouldResolveTerminalPalette,
  shouldTrackSystemThemeMode,
} from "./rendererTheme";
import { normalizeTuiThemeId, resolveTerminalThemeMode, resolveTuiTheme } from "./theme";
import { App } from "./ui";

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function shouldUseKittyKeyboard(env: NodeJS.ProcessEnv = process.env): boolean {
  const forced = readBooleanEnv(env.T1CODE_USE_KITTY_KEYBOARD);
  if (forced !== undefined) return forced;
  const identity = [env.TERM_PROGRAM, env.TERM, env.COLORTERM]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return ["ghostty", "kitty", "wezterm", "iterm"].some((token) => identity.includes(token));
}

function shouldUseAlternateScreen(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T1CODE_USE_ALTERNATE_SCREEN) ?? true;
}

function shouldUseMouse(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T1CODE_USE_MOUSE) ?? true;
}

function shouldEnableMouseMovement(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBooleanEnv(env.T1CODE_ENABLE_MOUSE_MOVEMENT) ?? false;
}

if (process.env.T1CODE_HEADLESS === "1") {
  const paths = resolveTuiPaths();
  const outputPath =
    process.env.T1CODE_HEADLESS_FRAME_PATH?.trim() ||
    path.join(paths.configHomeDir, "headless-frame.txt");
  const timeoutMs = Number(process.env.T1CODE_HEADLESS_TIMEOUT_MS ?? 1_500);
  const width = Number(process.env.T1CODE_HEADLESS_WIDTH ?? 160);
  const height = Number(process.env.T1CODE_HEADLESS_HEIGHT ?? 48);
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
  let interruptRequestToken = 0;
  const paths = resolveTuiPaths();
  const prefs = await readPrefs(paths);
  const appTheme = prefs.appSettings?.theme ?? DEFAULT_APP_THEME;
  const tuiThemeId = normalizeTuiThemeId(prefs.tuiThemeId);
  const tracksSystemThemeMode = shouldTrackSystemThemeMode(appTheme);
  const usesTerminalPalette = shouldResolveTerminalPalette(tuiThemeId);
  const shouldDeferInitialBackground = tracksSystemThemeMode || usesTerminalPalette;
  const initialTheme = resolveTuiTheme(appTheme, tuiThemeId);
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useAlternateScreen: shouldUseAlternateScreen(),
    useMouse: shouldUseMouse(),
    enableMouseMovement: shouldEnableMouseMovement(),
    useKittyKeyboard: shouldUseKittyKeyboard() ? { events: true } : null,
    ...(!shouldDeferInitialBackground ? { backgroundColor: initialTheme.palette.canvas } : {}),
  });
  const initialRendererThemeMode = normalizeRendererThemeMode(renderer.themeMode);
  const detectedTerminalPalette = usesTerminalPalette
    ? await resolveTerminalPalette(renderer, { clearCache: true })
    : { colors: null, durationMs: 0 };
  const initialSystemThemeMode =
    resolveTerminalThemeMode(detectedTerminalPalette.colors) ?? initialRendererThemeMode;
  const rendererTheme = resolveTuiTheme(appTheme, tuiThemeId, {
    systemMode: initialSystemThemeMode,
    terminalColors: detectedTerminalPalette.colors,
  });
  renderer.setBackgroundColor?.(rendererTheme.palette.canvas);
  const root = createRoot(renderer);

  const renderApp = () => {
    root.render(
      <App
        renderer={renderer}
        interruptRequestToken={interruptRequestToken}
        onRequestExit={() => shutdown(0)}
        initialTuiThemeId={tuiThemeId}
        initialSystemThemeMode={initialSystemThemeMode}
        initialTerminalThemeColors={detectedTerminalPalette.colors}
        {...(prefs.appSettings ? { initialAppSettings: prefs.appSettings } : {})}
      />,
    );
  };

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
    [
      "SIGINT",
      () => {
        interruptRequestToken += 1;
        renderApp();
      },
    ],
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

  renderApp();
}

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TUI_THEME,
  DEFAULT_TUI_THEME_ID,
  type TerminalColors,
  hasUsableTerminalColors,
  normalizeTuiThemeId,
  resolveTuiTheme,
  resolveTuiThemeMode,
} from "./theme";

const SAMPLE_TERMINAL_COLORS: TerminalColors = {
  palette: [
    "#2e3440",
    "#bf616a",
    "#a3be8c",
    "#ebcb8b",
    "#81a1c1",
    "#b48ead",
    "#88c0d0",
    "#e5e9f0",
    "#4c566a",
    "#d08770",
    "#a3be8c",
    "#ebcb8b",
    "#81a1c1",
    "#b48ead",
    "#8fbcbb",
    "#eceff4",
  ],
  defaultForeground: "#e5e9f0",
  defaultBackground: "#2e3440",
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightBackground: null,
  highlightForeground: null,
};

const EMPTY_TERMINAL_COLORS: TerminalColors = {
  palette: Array.from({ length: 16 }, () => null),
  defaultForeground: null,
  defaultBackground: null,
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightBackground: null,
  highlightForeground: null,
};

const PARTIAL_TERMINAL_COLORS: TerminalColors = {
  palette: Array.from({ length: 16 }, () => null),
  defaultForeground: null,
  defaultBackground: "#2e3440",
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightBackground: null,
  highlightForeground: null,
};

describe("resolveTuiThemeMode", () => {
  it("falls back to dark and respects detected system mode when provided", () => {
    expect(resolveTuiThemeMode("system")).toBe("dark");
    expect(resolveTuiThemeMode("system", "light")).toBe("light");
    for (const theme of ["dark", "light", undefined] as const) {
      expect(resolveTuiThemeMode(theme)).toBe(theme ?? "dark");
    }
  });
});

describe("hasUsableTerminalColors", () => {
  it("requires both a usable background and text color source", () => {
    expect(hasUsableTerminalColors(EMPTY_TERMINAL_COLORS)).toBe(false);
    expect(hasUsableTerminalColors(PARTIAL_TERMINAL_COLORS)).toBe(false);
    expect(hasUsableTerminalColors(SAMPLE_TERMINAL_COLORS)).toBe(true);
    expect(hasUsableTerminalColors(null)).toBe(false);
  });
});

describe("normalizeTuiThemeId", () => {
  it("accepts known ids and normalizes unknown values at the boundary", () => {
    expect(normalizeTuiThemeId("default")).toBe("default");
    expect(normalizeTuiThemeId("terminal-match")).toBe("terminal-match");
    expect(normalizeTuiThemeId("not-a-theme")).toBe(DEFAULT_TUI_THEME_ID);
    expect(normalizeTuiThemeId(null)).toBe(DEFAULT_TUI_THEME_ID);
  });
});

describe("resolveTuiTheme", () => {
  it.each([
    {
      input: "dark" as const,
      expected: {
        mode: "dark",
        canvas: "#171717",
        composerSend: "#2f438e",
        codeBlockBackground: "#101010",
        diffSign: "#4ade80",
        buttonText: "#d1d5db",
      },
    },
    {
      input: "light" as const,
      expected: {
        mode: "light",
        canvas: "#f5f5f5",
        composerSend: "#60a5fa",
        codeBlockBackground: "#101010",
        diffSign: "#f87171",
        buttonText: "#f5f5f5",
      },
    },
  ])("preserves the existing $input theme values", ({ input, expected }) => {
    const theme = resolveTuiTheme(input);

    expect(theme.id).toBe("default");
    expect(theme.mode).toBe(expected.mode);
    expect(theme.palette.canvas).toBe(expected.canvas);
    expect(theme.palette.composerSend).toBe(expected.composerSend);
    expect(theme.codeBlock.background).toBe(expected.codeBlockBackground);
    expect(
      input === "dark" ? theme.diffViewer.addedSignColor : theme.diffViewer.removedSignColor,
    ).toBe(expected.diffSign);
    expect(input === "dark" ? theme.colors.sendDotActive : theme.colors.primaryButtonText).toBe(
      expected.buttonText,
    );
  });

  it("lets the default preset follow the detected system mode", () => {
    const theme = resolveTuiTheme("system", DEFAULT_TUI_THEME_ID, { systemMode: "light" });

    expect(theme.mode).toBe("light");
    expect(theme.id).toBe("default");
    expect(theme.palette.canvas).toBe("#f5f5f5");
  });

  it("builds the terminal-match preset from terminal colors", () => {
    const theme = resolveTuiTheme("system", "terminal-match", {
      systemMode: "dark",
      terminalColors: SAMPLE_TERMINAL_COLORS,
    });

    expect(theme.mode).toBe("dark");
    expect(theme.id).toBe("terminal-match");
    expect(theme.palette.canvas).toBe("#2e344000");
    expect(theme.palette.text).toBe("#e5e9f0");
    expect(theme.palette.accent).toBe("#88c0d0");
    expect(theme.palette.composerSend).toBe("#88c0d0");
    expect(theme.colors.selectedText).toBe("#2e3440");
    expect(theme.status.planReady).toBe("#b48ead");
    expect(theme.diffViewer.addedSignColor).toBe("#a3be8c");
  });

  it("falls back to the default preset when terminal-match colors are unavailable", () => {
    expect(resolveTuiTheme("dark", "terminal-match")).toBe(DEFAULT_TUI_THEME);
    expect(
      resolveTuiTheme("dark", "terminal-match", {
        terminalColors: EMPTY_TERMINAL_COLORS,
      }),
    ).toBe(DEFAULT_TUI_THEME);
  });

  it("falls back to the default preset when terminal colors are incomplete", () => {
    expect(
      resolveTuiTheme("dark", "terminal-match", {
        terminalColors: PARTIAL_TERMINAL_COLORS,
      }),
    ).toBe(DEFAULT_TUI_THEME);
  });
});

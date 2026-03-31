import { describe, expect, it } from "vitest";

import {
  KEYBINDING_GUIDE_SECTIONS,
  isCtrlA,
  isCtrlC,
  isCtrlShiftA,
  isCtrlShiftC,
  shouldClearComposerOnCtrlC,
  shouldCopyComposerSelectionOnCtrlShiftC,
  shouldInterruptComposerOnEscape,
  shouldSelectAllComposerOnCtrlShiftA,
} from "./keyboardBehavior";

describe("keyboardBehavior", () => {
  it("detects ctrl-c", () => {
    expect(
      isCtrlC({
        keyName: "c",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("detects ctrl-a", () => {
    expect(
      isCtrlA({
        keyName: "a",
        ctrl: true,
      }),
    ).toBe(true);
  });

  it("detects ctrl-shift-a", () => {
    expect(
      isCtrlShiftA({
        keyName: "a",
        ctrl: true,
        shift: true,
      }),
    ).toBe(true);
  });

  it("detects ctrl-shift-c", () => {
    expect(
      isCtrlShiftC({
        keyName: "c",
        ctrl: true,
        shift: true,
      }),
    ).toBe(true);
  });

  it("uses ctrl-shift-a to select all in the focused composer", () => {
    expect(
      shouldSelectAllComposerOnCtrlShiftA({
        keyName: "a",
        ctrl: true,
        shift: true,
        composerFocused: true,
      }),
    ).toBe(true);
  });

  it("copies the current composer selection on ctrl-shift-c", () => {
    expect(
      shouldCopyComposerSelectionOnCtrlShiftC({
        keyName: "c",
        ctrl: true,
        shift: true,
        composerFocused: true,
        hasSelection: true,
      }),
    ).toBe(true);
  });

  it("treats ctrl-c as the composer clear shortcut when input handles it", () => {
    expect(
      shouldClearComposerOnCtrlC({
        keyName: "c",
        ctrl: true,
        composerFocused: true,
        hasComposerText: true,
      }),
    ).toBe(true);
  });

  it("does not clear the composer on ctrl-shift-c", () => {
    expect(
      shouldClearComposerOnCtrlC({
        keyName: "c",
        ctrl: true,
        shift: true,
        composerFocused: true,
        hasComposerText: true,
      }),
    ).toBe(false);
  });

  it("uses escape as the stop shortcut only when stop is the active composer action", () => {
    expect(
      shouldInterruptComposerOnEscape({
        keyName: "escape",
        hasDismissibleLayer: false,
        showStopAction: true,
      }),
    ).toBe(true);
    expect(
      shouldInterruptComposerOnEscape({
        keyName: "escape",
        hasDismissibleLayer: true,
        showStopAction: true,
      }),
    ).toBe(false);
    expect(
      shouldInterruptComposerOnEscape({
        keyName: "escape",
        hasDismissibleLayer: false,
        showStopAction: false,
      }),
    ).toBe(false);
  });

  it("documents the updated quit flow", () => {
    const globalSection = KEYBINDING_GUIDE_SECTIONS.find((section) => section.title === "Global");
    const composerSection = KEYBINDING_GUIDE_SECTIONS.find(
      (section) => section.title === "Composer",
    );

    expect(globalSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+C",
        action: "Open the quit prompt; press Ctrl+C again to confirm exit",
      }),
    );
    expect(globalSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Esc",
        action: "Close the active dialog, overlay, or image preview",
      }),
    );
    expect(globalSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+C / Enter",
        action: "Confirm quit from the exit prompt",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Shift+Enter / Ctrl+J",
        action: "Insert a newline",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+Shift+A",
        action: "Select all text in the composer",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+Shift+C",
        action: "Copy the current composer selection",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Esc",
        action: "Stop the active turn",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+C",
        action: "Clear the current draft",
      }),
    );
  });
});

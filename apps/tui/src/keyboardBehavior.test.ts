import { describe, expect, it } from "vitest";

import {
  isCtrlC,
  resolveKeybindingGuideSections,
  shouldClearComposerOnCtrlC,
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

  it("does not clear the composer when it is not focused", () => {
    expect(
      shouldClearComposerOnCtrlC({
        keyName: "c",
        ctrl: true,
        composerFocused: false,
        hasComposerText: true,
      }),
    ).toBe(false);
  });

  it("does not clear the composer when the draft is empty", () => {
    expect(
      shouldClearComposerOnCtrlC({
        keyName: "c",
        ctrl: true,
        composerFocused: true,
        hasComposerText: false,
      }),
    ).toBe(false);
  });

  it("documents the updated quit flow", () => {
    const sections = resolveKeybindingGuideSections(false);
    const globalSection = sections.find((section) => section.title === "Global");
    const composerSection = sections.find((section) => section.title === "Composer");

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
        shortcut: "Ctrl+C",
        action: "Clear the current draft",
      }),
    );
  });

  it("switches displayed fallback shortcuts for windows terminal sessions", () => {
    const sections = resolveKeybindingGuideSections(true);
    const projectsSection = sections.find((section) => section.title === "Projects and Threads");
    const composerSection = sections.find((section) => section.title === "Composer");

    expect(projectsSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+T",
        action: "Toggle the terminal pane for the active thread",
      }),
    );
    expect(composerSection?.items).toContainEqual(
      expect.objectContaining({
        shortcut: "Ctrl+O",
        action: "Insert a newline",
      }),
    );
  });
});

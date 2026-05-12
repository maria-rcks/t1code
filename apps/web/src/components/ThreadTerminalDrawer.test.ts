import { describe, expect, it } from "vitest";
import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";

import {
  resolveTerminalSelectionActionPosition,
  shouldBypassXtermForGlobalTerminalShortcut,
  shouldHandleTerminalSelectionMouseUp,
  terminalSelectionActionDelayForClickCount,
} from "./ThreadTerminalDrawer";
import { type ShortcutEventLike } from "../keybindings";

function keyEvent(overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key: "j",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

const terminalKeybindings: ResolvedKeybindingsConfig = [
  {
    command: "terminal.toggle",
    shortcut: {
      key: "j",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: false,
    },
  },
  {
    command: "diff.toggle",
    shortcut: {
      key: "d",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      modKey: false,
    },
  },
];

describe("resolveTerminalSelectionActionPosition", () => {
  it("prefers the selection rect over the last pointer position", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: { right: 260, bottom: 140 },
        pointer: { x: 520, y: 200 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 260,
      y: 144,
    });
  });

  it("falls back to the pointer position when no selection rect is available", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 180, y: 130 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 180,
      y: 130,
    });
  });

  it("clamps the pointer fallback into the terminal drawer bounds", () => {
    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 720, y: 340 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 600,
      y: 270,
    });

    expect(
      resolveTerminalSelectionActionPosition({
        bounds: { left: 100, top: 50, width: 500, height: 220 },
        selectionRect: null,
        pointer: { x: 40, y: 20 },
        viewport: { width: 1024, height: 768 },
      }),
    ).toEqual({
      x: 100,
      y: 50,
    });
  });

  it("delays multi-click selection actions so triple-click selection can complete", () => {
    expect(terminalSelectionActionDelayForClickCount(1)).toBe(0);
    expect(terminalSelectionActionDelayForClickCount(2)).toBe(260);
    expect(terminalSelectionActionDelayForClickCount(3)).toBe(260);
  });

  it("only handles mouseup when the selection gesture started in the terminal", () => {
    expect(shouldHandleTerminalSelectionMouseUp(true, 0)).toBe(true);
    expect(shouldHandleTerminalSelectionMouseUp(false, 0)).toBe(false);
    expect(shouldHandleTerminalSelectionMouseUp(true, 1)).toBe(false);
  });

  it("bypasses xterm for global terminal shortcuts", () => {
    expect(
      shouldBypassXtermForGlobalTerminalShortcut(
        keyEvent({ key: "j", metaKey: true }),
        terminalKeybindings,
      ),
    ).toBe(true);
    expect(
      shouldBypassXtermForGlobalTerminalShortcut(
        keyEvent({ key: "d", metaKey: true }),
        terminalKeybindings,
      ),
    ).toBe(true);
    expect(
      shouldBypassXtermForGlobalTerminalShortcut(
        keyEvent({ key: "l", ctrlKey: true }),
        terminalKeybindings,
      ),
    ).toBe(false);
  });
});

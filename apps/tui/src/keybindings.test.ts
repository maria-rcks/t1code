import { describe, expect, it } from "vitest";
import { type KeybindingShortcut, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  modelPickerJumpIndexFromCommand,
  resolveTuiShortcutCommand,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "./keybindings";

function modShortcut(
  key: string,
  overrides: Partial<Omit<KeybindingShortcut, "key">> = {},
): KeybindingShortcut {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    modKey: true,
    ...overrides,
  };
}

const keybindings: ResolvedKeybindingsConfig = [
  {
    command: "thread.jump.1",
    shortcut: modShortcut("1"),
  },
  {
    command: "modelPicker.toggle",
    shortcut: modShortcut("m", { shiftKey: true }),
    whenAst: { type: "not", node: { type: "identifier", name: "terminalFocus" } },
  },
  {
    command: "modelPicker.jump.1",
    shortcut: modShortcut("1"),
    whenAst: { type: "identifier", name: "modelPickerOpen" },
  },
];

describe("resolveTuiShortcutCommand", () => {
  it("matches mod shortcuts using ctrl on non-mac platforms", () => {
    expect(
      resolveTuiShortcutCommand({ keyName: "m", ctrl: true, shift: true }, keybindings, {
        platform: "linux",
      }),
    ).toBe("modelPicker.toggle");
  });

  it("matches mod shortcuts using meta or super on macOS", () => {
    expect(
      resolveTuiShortcutCommand({ keyName: "m", meta: true, shift: true }, keybindings, {
        platform: "darwin",
      }),
    ).toBe("modelPicker.toggle");

    expect(
      resolveTuiShortcutCommand({ keyName: "m", super: true, shift: true }, keybindings, {
        platform: "darwin",
      }),
    ).toBe("modelPicker.toggle");
  });

  it("honors when clauses and resolves later active bindings first", () => {
    expect(
      resolveTuiShortcutCommand({ keyName: "1", ctrl: true }, keybindings, {
        platform: "linux",
        context: { modelPickerOpen: false },
      }),
    ).toBe("thread.jump.1");

    expect(
      resolveTuiShortcutCommand({ keyName: "1", ctrl: true }, keybindings, {
        platform: "linux",
        context: { modelPickerOpen: true },
      }),
    ).toBe("modelPicker.jump.1");
  });
});

describe("modelPickerJumpIndexFromCommand", () => {
  it("maps model picker jump commands to zero-based indexes", () => {
    expect(modelPickerJumpIndexFromCommand("modelPicker.jump.1")).toBe(0);
    expect(modelPickerJumpIndexFromCommand("modelPicker.jump.9")).toBe(8);
    expect(modelPickerJumpIndexFromCommand("thread.jump.1")).toBeNull();
  });
});

describe("thread command helpers", () => {
  it("maps thread jump commands to zero-based indexes", () => {
    expect(threadJumpIndexFromCommand("thread.jump.1")).toBe(0);
    expect(threadJumpIndexFromCommand("thread.jump.9")).toBe(8);
    expect(threadJumpIndexFromCommand("modelPicker.jump.1")).toBeNull();
  });

  it("maps thread traversal commands to directions", () => {
    expect(threadTraversalDirectionFromCommand("thread.previous")).toBe("previous");
    expect(threadTraversalDirectionFromCommand("thread.next")).toBe("next");
    expect(threadTraversalDirectionFromCommand("thread.jump.1")).toBeNull();
  });
});

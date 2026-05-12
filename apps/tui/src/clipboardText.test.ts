import { describe, expect, it } from "vitest";

import { resolveClipboardCopyCommands } from "./clipboardText";

describe("resolveClipboardCopyCommands", () => {
  it("uses pbcopy on macOS", () => {
    expect(resolveClipboardCopyCommands("darwin")).toEqual([["pbcopy"]]);
  });

  it("uses native Linux helpers and falls back to WSL clip.exe", () => {
    expect(resolveClipboardCopyCommands("linux")).toEqual([
      ["wl-copy"],
      ["xclip", "-selection", "clipboard"],
      ["xsel", "--clipboard", "--input"],
      ["clip.exe"],
    ]);
  });

  it("supports Windows without Unix clipboard helpers", () => {
    expect(resolveClipboardCopyCommands("win32")).toEqual([
      [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
      ["clip.exe"],
    ]);
  });

  it("returns no helpers for unsupported platforms", () => {
    expect(resolveClipboardCopyCommands("aix")).toEqual([]);
  });
});

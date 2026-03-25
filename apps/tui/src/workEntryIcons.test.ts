import { describe, expect, it } from "vitest";

import type { WorkLogEntry } from "@t3tools/client-core";

import { resolveWorkEntryIcon } from "./workEntryIcons";

function makeEntry(overrides: Partial<WorkLogEntry> = {}): WorkLogEntry {
  return {
    id: "entry-1",
    createdAt: "2026-03-24T00:00:00.000Z",
    label: "Tool call",
    tone: "tool",
    ...overrides,
  };
}

describe("resolveWorkEntryIcon", () => {
  it("keeps explicit command and file request kinds distinct", () => {
    expect(resolveWorkEntryIcon(makeEntry({ requestKind: "command" }))).toBe("󰆍");
    expect(resolveWorkEntryIcon(makeEntry({ requestKind: "file-read" }))).toBe("󰈈");
    expect(resolveWorkEntryIcon(makeEntry({ requestKind: "file-change" }))).toBe("󰏫");
  });

  it("splits generic mcp tool calls by label", () => {
    expect(
      resolveWorkEntryIcon(makeEntry({ itemType: "mcp_tool_call", toolTitle: "Read file" })),
    ).toBe("󰈈");
    expect(
      resolveWorkEntryIcon(makeEntry({ itemType: "mcp_tool_call", toolTitle: "Apply patch" })),
    ).toBe("󰏫");
    expect(
      resolveWorkEntryIcon(makeEntry({ itemType: "mcp_tool_call", toolTitle: "Search query" })),
    ).toBe("󰖟");
  });

  it("uses a specific image icon for image views", () => {
    expect(resolveWorkEntryIcon(makeEntry({ itemType: "image_view" }))).toBe("󰋩");
  });

  it("falls back to generic dynamic tool icons when no richer hint exists", () => {
    expect(resolveWorkEntryIcon(makeEntry({ itemType: "dynamic_tool_call" }))).toBe("󰞷");
  });
});

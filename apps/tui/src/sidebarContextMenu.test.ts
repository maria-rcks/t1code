import { describe, expect, it } from "vitest";

import {
  buildProjectContextMenuItems,
  buildThreadContextMenuItems,
  buildMultiSelectContextMenuItems,
  clearThreadSelection,
  clearLocallyUnreadThread,
  markThreadUnreadLocally,
  rangeSelectThreads,
  removeFromThreadSelection,
  toggleThreadSelection,
} from "./sidebarContextMenu";

describe("sidebarContextMenu", () => {
  it("matches the web thread context menu items", () => {
    expect(buildThreadContextMenuItems()).toEqual([
      { id: "rename", label: "Rename thread" },
      { id: "mark-unread", label: "Mark unread" },
      { id: "copy-path", label: "Copy Path" },
      { id: "copy-thread-id", label: "Copy Thread ID" },
      { id: "delete", label: "Delete", destructive: true },
    ]);
  });

  it("matches the web project context menu item", () => {
    expect(buildProjectContextMenuItems()).toEqual([
      { id: "delete", label: "Remove project", destructive: true },
    ]);
  });

  it("matches the web multi-select context menu items", () => {
    expect(buildMultiSelectContextMenuItems(3)).toEqual([
      { id: "mark-unread", label: "Mark unread (3)" },
      { id: "delete", label: "Delete (3)", destructive: true },
    ]);
  });

  it("only marks completed threads unread locally", () => {
    const original = new Set<string>();

    expect(
      markThreadUnreadLocally(original, {
        id: "thread-running" as never,
        latestTurn: null,
      }),
    ).toBe(original);

    const updated = markThreadUnreadLocally(original, {
      id: "thread-complete" as never,
      latestTurn: {
        completedAt: "2026-03-24T12:00:00.000Z",
      } as never,
    });

    expect(updated).not.toBe(original);
    expect([...updated]).toEqual(["thread-complete"]);
  });

  it("clears locally unread threads when selected again", () => {
    const original = new Set(["thread-a", "thread-b"]);

    expect(clearLocallyUnreadThread(original, "thread-c")).toBe(original);
    expect([...clearLocallyUnreadThread(original, "thread-a")]).toEqual(["thread-b"]);
  });

  it("toggles and anchors thread selection", () => {
    const selected = toggleThreadSelection(clearThreadSelection(), "thread-a");
    expect([...selected.selectedThreadIds]).toEqual(["thread-a"]);
    expect(selected.anchorThreadId).toBe("thread-a");

    const cleared = toggleThreadSelection(selected, "thread-a");
    expect([...cleared.selectedThreadIds]).toEqual([]);
    expect(cleared.anchorThreadId).toBe("thread-a");
  });

  it("range selects within ordered project threads", () => {
    const selected = rangeSelectThreads(
      {
        selectedThreadIds: new Set(["thread-a"]),
        anchorThreadId: "thread-a",
      },
      "thread-c",
      ["thread-a", "thread-b", "thread-c", "thread-d"],
    );

    expect([...selected.selectedThreadIds]).toEqual(["thread-a", "thread-b", "thread-c"]);
    expect(selected.anchorThreadId).toBe("thread-a");
  });

  it("removes deleted threads from the selection", () => {
    const updated = removeFromThreadSelection(
      {
        selectedThreadIds: new Set(["thread-a", "thread-b", "thread-c"]),
        anchorThreadId: "thread-b",
      },
      ["thread-b", "thread-c"],
    );

    expect([...updated.selectedThreadIds]).toEqual(["thread-a"]);
    expect(updated.anchorThreadId).toBeNull();
  });
});

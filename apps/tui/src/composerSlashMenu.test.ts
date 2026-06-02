import { describe, expect, it } from "vitest";

import { clampSlashCommandMenuIndex, resolveTuiSlashCommandMenu } from "./composerSlashMenu";

describe("resolveTuiSlashCommandMenu", () => {
  it("shows slash commands for an empty slash query", () => {
    const menu = resolveTuiSlashCommandMenu({ composer: "/", focused: true });

    expect(menu?.query).toBe("");
    expect(menu?.items.map((item) => item.command)).toContain("help");
  });

  it("filters commands by the typed command prefix", () => {
    const menu = resolveTuiSlashCommandMenu({ composer: "/cl", focused: true });

    expect(menu?.items.map((item) => item.command)).toEqual(["clone"]);
  });

  it("stays hidden when the composer is unfocused, blocked, or no longer a command prefix", () => {
    expect(resolveTuiSlashCommandMenu({ composer: "/", focused: false })).toBeNull();
    expect(resolveTuiSlashCommandMenu({ composer: "/", focused: true, blocked: true })).toBeNull();
    expect(resolveTuiSlashCommandMenu({ composer: "/clone repo", focused: true })).toBeNull();
  });
});

describe("clampSlashCommandMenuIndex", () => {
  it("keeps the selected index within the visible menu bounds", () => {
    expect(clampSlashCommandMenuIndex(-1, 3)).toBe(0);
    expect(clampSlashCommandMenuIndex(2, 3)).toBe(2);
    expect(clampSlashCommandMenuIndex(5, 3)).toBe(2);
    expect(clampSlashCommandMenuIndex(5, 0)).toBe(0);
  });
});

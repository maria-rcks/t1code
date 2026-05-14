import { describe, expect, it } from "vitest";

import { rankModelPickerItems, scoreModelPickerSearch } from "./modelPickerSearch";

const items = [
  {
    name: "Claude Opus 4.6",
    slug: "claude-opus-4-6",
    driverKind: "claude",
    providerDisplayName: "Claude Work",
  },
  {
    name: "GPT-5.2",
    slug: "gpt-5.2",
    driverKind: "codex",
    providerDisplayName: "Codex Personal",
  },
  {
    name: "GPT-5.2 Codex",
    slug: "gpt-5.2-codex",
    driverKind: "codex",
    providerDisplayName: "Codex Work",
    isFavorite: true,
  },
] as const;

describe("model picker search", () => {
  it("matches across model name, slug, driver, and provider display name", () => {
    expect(rankModelPickerItems(items, "opus").map((item) => item.slug)).toEqual([
      "claude-opus-4-6",
    ]);
    expect(rankModelPickerItems(items, "personal gpt").map((item) => item.slug)).toEqual([
      "gpt-5.2",
    ]);
    expect(rankModelPickerItems(items, "codex").map((item) => item.slug)).toEqual([
      "gpt-5.2-codex",
      "gpt-5.2",
    ]);
  });

  it("boosts favorites without returning non-matches", () => {
    expect(scoreModelPickerSearch(items[2], "gpt")).toBeLessThan(
      scoreModelPickerSearch(items[1], "gpt") ?? Number.POSITIVE_INFINITY,
    );
    expect(rankModelPickerItems(items, "does-not-exist")).toEqual([]);
  });

  it("matches model short names and subproviders", () => {
    const copilotModel = {
      name: "Claude Opus 4.6",
      slug: "claude-opus-4-6",
      shortName: "Opus 4.6",
      subProvider: "GitHub Copilot",
      driverKind: "opencode",
      providerDisplayName: "OpenCode",
    };

    expect(scoreModelPickerSearch(copilotModel, "copilot opus")).not.toBeNull();
    expect(scoreModelPickerSearch(copilotModel, "github 4.6")).not.toBeNull();
  });
});

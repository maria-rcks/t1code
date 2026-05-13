import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  deriveProviderInstanceEntries,
  getProviderInstanceModelOptions,
  getProviderInstanceModels,
  normalizeProviderAccentColor,
  resolveSelectableProviderInstance,
  sortProviderInstanceEntries,
} from "./providerInstances";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

const model = (slug: string): ServerProviderModel => ({
  slug,
  name: slug,
  isCustom: false,
  capabilities: null,
});

const provider = (input: {
  instanceId: string;
  driver: string;
  displayName?: string;
  accentColor?: string;
  enabled?: boolean;
  availability?: "available" | "unavailable";
  models?: ReadonlyArray<ServerProviderModel>;
}): ServerProvider => ({
  instanceId: decodeProviderInstanceId(input.instanceId),
  driver: decodeProviderDriverKind(input.driver),
  ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
  ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
  enabled: input.enabled ?? true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-05-13T12:00:00.000Z",
  availability: input.availability ?? "available",
  models: [...(input.models ?? [])],
  slashCommands: [],
  skills: [],
});

describe("providerInstances", () => {
  it("derives display names and availability for default and custom instances", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        instanceId: "codex",
        driver: "codex",
        displayName: "Codex",
        accentColor: " #112233 ",
      }),
      provider({
        instanceId: "codex_personal",
        driver: "codex",
        displayName: "Codex",
        accentColor: "not-a-color",
        availability: "unavailable",
      }),
    ]);

    expect(entries[0]).toMatchObject({
      displayName: "Codex",
      isDefault: true,
      isAvailable: true,
      accentColor: "#112233",
    });
    expect(entries[1]).toMatchObject({
      displayName: "Codex Personal",
      isDefault: false,
      isAvailable: false,
    });
    expect(entries[1]?.accentColor).toBeUndefined();
  });

  it("keeps configured display names over driver labels", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        instanceId: "claude_openrouter",
        driver: "claudeAgent",
        displayName: "OpenRouter Claude",
      }),
    ]);

    expect(entry?.displayName).toBe("OpenRouter Claude");
  });

  it("sorts default instances before custom instances within each driver bucket", () => {
    const sorted = sortProviderInstanceEntries(
      deriveProviderInstanceEntries([
        provider({ instanceId: "codex_personal", driver: "codex" }),
        provider({ instanceId: "codex", driver: "codex" }),
        provider({ instanceId: "claude_work", driver: "claudeAgent" }),
        provider({ instanceId: "claudeAgent", driver: "claudeAgent" }),
      ]),
    );

    expect(sorted.map((entry) => entry.instanceId)).toEqual([
      "codex",
      "codex_personal",
      "claudeAgent",
      "claude_work",
    ]);
  });

  it("looks up model lists by instance id", () => {
    const providers = [
      provider({ instanceId: "codex", driver: "codex", models: [model("gpt-5.4")] }),
      provider({
        instanceId: "codex_personal",
        driver: "codex",
        models: [model("gpt-5.4-mini")],
      }),
    ];

    expect(
      getProviderInstanceModels(providers, decodeProviderInstanceId("codex_personal")),
    ).toEqual([model("gpt-5.4-mini")]);
  });

  it("uses instance model options while preserving custom fallback models", () => {
    const providers = [
      provider({
        instanceId: "codex",
        driver: "codex",
        models: [model("gpt-5.4"), { ...model("custom/live"), isCustom: true }],
      }),
    ];

    expect(
      getProviderInstanceModelOptions(providers, decodeProviderInstanceId("codex"), [
        { slug: "gpt-5.4-mini", name: "GPT-5.4 Mini", isCustom: false },
        { slug: "custom/local", name: "custom/local", isCustom: true },
        { slug: "custom/live", name: "custom/live", isCustom: true },
      ]),
    ).toEqual([
      { slug: "gpt-5.4", name: "gpt-5.4", isCustom: false },
      { slug: "custom/live", name: "custom/live", isCustom: true },
      { slug: "custom/local", name: "custom/local", isCustom: true },
    ]);
  });

  it("resolves unavailable selections to the first enabled available instance", () => {
    const providers = [
      provider({
        instanceId: "codex_personal",
        driver: "codex",
        availability: "unavailable",
      }),
      provider({ instanceId: "claudeAgent", driver: "claudeAgent" }),
    ];

    expect(
      resolveSelectableProviderInstance(providers, decodeProviderInstanceId("codex_personal")),
    ).toBe("claudeAgent");
  });

  it("normalizes only six-digit hex accent colors", () => {
    expect(normalizeProviderAccentColor(" #A0b1C2 ")).toBe("#A0b1C2");
    expect(normalizeProviderAccentColor("#fff")).toBeUndefined();
    expect(normalizeProviderAccentColor("blue")).toBeUndefined();
  });
});

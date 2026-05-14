import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";
import { Schema } from "effect";
import {
  COMING_SOON_INSTALL_PROVIDER_OPTIONS,
  INSTALL_PROVIDER_SETTINGS,
  buildDeleteProviderInstancePatch,
  buildDefaultProviderInstanceUpdatePatch,
  buildDuplicateDefaultProviderInstancePatch,
  buildProviderInstanceUpdatePatch,
  buildResetDefaultProviderInstancesPatch,
  buildResetProviderCustomModelsPatch,
  defaultProviderInstanceIdForSettingsKey,
  providerDriverKindForSettingsKey,
} from "./providerSettings";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

describe("providerSettings", () => {
  it("maps legacy provider settings keys to default instance ids", () => {
    expect(providerDriverKindForSettingsKey("codex")).toBe("codex");
    expect(providerDriverKindForSettingsKey("opencode")).toBe("opencode");
    expect(defaultProviderInstanceIdForSettingsKey("cursor")).toBe("cursor");
  });

  it("derives provider install fields from contract schema annotations", () => {
    expect(
      INSTALL_PROVIDER_SETTINGS.map((settings) => ({
        provider: settings.provider,
        badgeLabel: settings.badgeLabel ?? null,
        fields: settings.fields.map((field) => field.key),
      })),
    ).toEqual([
      {
        provider: "codex",
        badgeLabel: null,
        fields: ["binaryPath", "homePath", "shadowHomePath"],
      },
      {
        provider: "claudeAgent",
        badgeLabel: null,
        fields: ["binaryPath", "homePath", "launchArgs"],
      },
      {
        provider: "cursor",
        badgeLabel: "Early Access",
        fields: ["binaryPath", "apiEndpoint"],
      },
      {
        provider: "opencode",
        badgeLabel: null,
        fields: ["binaryPath", "serverUrl", "serverPassword"],
      },
    ]);
    expect(INSTALL_PROVIDER_SETTINGS[3]?.fields[2]).toMatchObject({
      key: "serverPassword",
      label: "Server password",
      placeholder: "Optional",
    });
  });

  it("exposes coming soon provider install options", () => {
    expect(
      COMING_SOON_INSTALL_PROVIDER_OPTIONS.map((option) => ({
        provider: option.provider,
        title: option.title,
      })),
    ).toEqual([
      { provider: "githubCopilot", title: "GitHub Copilot" },
      { provider: "gemini", title: "Gemini" },
      { provider: "acpRegistry", title: "ACP Registry" },
      { provider: "piAgent", title: "Pi Agent" },
    ]);
  });

  it("promotes default provider edits into providerInstances and resets legacy settings", () => {
    const patch = buildDefaultProviderInstanceUpdatePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providers: {
          ...DEFAULT_SERVER_SETTINGS.providers,
          codex: {
            ...DEFAULT_SERVER_SETTINGS.providers.codex,
            binaryPath: "/legacy/codex",
            homePath: "/legacy/home",
          },
        },
      },
      provider: "codex",
      configPatch: {
        binaryPath: "/opt/codex",
      },
    });

    expect(patch.providers?.codex).toEqual(DEFAULT_SERVER_SETTINGS.providers.codex);
    expect(patch.providerInstances?.[decodeProviderInstanceId("codex")]).toEqual({
      driver: decodeProviderDriverKind("codex"),
      config: {
        ...DEFAULT_SERVER_SETTINGS.providers.codex,
        binaryPath: "/opt/codex",
        homePath: "/legacy/home",
      },
    });
  });

  it("preserves existing default instance metadata and config while applying edits", () => {
    const instanceId = decodeProviderInstanceId("opencode");
    const existing = {
      driver: decodeProviderDriverKind("opencode"),
      displayName: "Work OpenCode",
      accentColor: "#aabbcc",
      config: {
        binaryPath: "/opt/opencode",
        serverUrl: "http://127.0.0.1:4096",
      },
    } satisfies ProviderInstanceConfig;

    const patch = buildDefaultProviderInstanceUpdatePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          [instanceId]: existing,
        },
      },
      provider: "opencode",
      configPatch: {
        serverPassword: "secret",
      },
    });

    expect(patch.providers?.opencode).toEqual(DEFAULT_SERVER_SETTINGS.providers.opencode);
    expect(patch.providerInstances?.[instanceId]).toEqual({
      ...existing,
      config: {
        ...DEFAULT_SERVER_SETTINGS.providers.opencode,
        binaryPath: "/opt/opencode",
        serverUrl: "http://127.0.0.1:4096",
        serverPassword: "secret",
      },
    });
  });

  it("writes default provider envelope updates alongside config edits", () => {
    const instanceId = decodeProviderInstanceId("claudeAgent");
    const patch = buildDefaultProviderInstanceUpdatePatch({
      settings: DEFAULT_SERVER_SETTINGS,
      provider: "claudeAgent",
      configPatch: {
        launchArgs: "--chrome",
      },
      instancePatch: {
        enabled: false,
        displayName: "Claude Work",
        accentColor: "#112233",
        environment: [
          { name: "ANTHROPIC_BASE_URL", value: "https://example.test", sensitive: false },
        ],
      },
    });

    expect(patch.providerInstances?.[instanceId]).toEqual({
      driver: decodeProviderDriverKind("claudeAgent"),
      enabled: false,
      displayName: "Claude Work",
      accentColor: "#112233",
      environment: [
        { name: "ANTHROPIC_BASE_URL", value: "https://example.test", sensitive: false },
      ],
      config: {
        ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
        launchArgs: "--chrome",
      },
    });
  });

  it("clears default provider envelope metadata when values are empty", () => {
    const instanceId = decodeProviderInstanceId("codex");
    const patch = buildDefaultProviderInstanceUpdatePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          [instanceId]: {
            driver: decodeProviderDriverKind("codex"),
            displayName: "Codex Work",
            accentColor: "#112233",
            environment: [{ name: "OPENAI_API_KEY", value: "sk-test", sensitive: true }],
          },
        },
      },
      provider: "codex",
      configPatch: {},
      instancePatch: {
        displayName: undefined,
        accentColor: undefined,
        environment: undefined,
      },
    });

    expect(patch.providerInstances?.[instanceId]).toEqual({
      driver: decodeProviderDriverKind("codex"),
      config: DEFAULT_SERVER_SETTINGS.providers.codex,
    });
  });

  it("resets default provider instances by deleting explicit default entries", () => {
    const codexId = decodeProviderInstanceId("codex");
    const customId = decodeProviderInstanceId("codex_personal");
    const patch = buildResetDefaultProviderInstancesPatch({
      settings: {
        providerInstances: {
          [codexId]: {
            driver: decodeProviderDriverKind("codex"),
            config: { binaryPath: "/opt/codex" },
          },
          [customId]: {
            driver: decodeProviderDriverKind("codex"),
            config: { binaryPath: "/opt/personal-codex" },
          },
        },
      },
      providers: ["codex", "cursor"],
    });

    expect(patch.providers?.codex).toEqual(DEFAULT_SERVER_SETTINGS.providers.codex);
    expect(patch.providers?.cursor).toEqual(DEFAULT_SERVER_SETTINGS.providers.cursor);
    expect(patch.providerInstances?.[codexId]).toBeUndefined();
    expect(patch.providerInstances?.[customId]).toEqual({
      driver: decodeProviderDriverKind("codex"),
      config: { binaryPath: "/opt/personal-codex" },
    });
  });

  it("resets custom models for every schema-backed provider", () => {
    const codexId = decodeProviderInstanceId("codex");
    const cursorId = decodeProviderInstanceId("cursor");
    const opencodeId = decodeProviderInstanceId("opencode");
    const patch = buildResetProviderCustomModelsPatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providerInstances: {
          [codexId]: {
            driver: decodeProviderDriverKind("codex"),
            config: { customModels: ["gpt-custom"], binaryPath: "/opt/codex" },
          },
          [cursorId]: {
            driver: decodeProviderDriverKind("cursor"),
            config: { customModels: ["cursor-custom"], binaryPath: "/opt/cursor" },
          },
          [opencodeId]: {
            driver: decodeProviderDriverKind("opencode"),
            config: { customModels: ["openrouter/custom"], serverUrl: "http://127.0.0.1:4096" },
          },
        },
      },
      providers: INSTALL_PROVIDER_SETTINGS.map((settings) => settings.provider),
    });

    expect(patch.providerInstances?.[codexId]?.config).toMatchObject({
      customModels: [],
      binaryPath: "/opt/codex",
    });
    expect(patch.providerInstances?.[cursorId]?.config).toMatchObject({
      customModels: [],
      binaryPath: "/opt/cursor",
    });
    expect(patch.providerInstances?.[opencodeId]?.config).toMatchObject({
      customModels: [],
      serverUrl: "http://127.0.0.1:4096",
    });
  });

  it("duplicates default provider settings into the next custom instance slot", () => {
    const codexId = decodeProviderInstanceId("codex");
    const codex2Id = decodeProviderInstanceId("codex_2");
    const codex3Id = decodeProviderInstanceId("codex_3");
    const { instanceId, patch } = buildDuplicateDefaultProviderInstancePatch({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        providers: {
          ...DEFAULT_SERVER_SETTINGS.providers,
          codex: {
            ...DEFAULT_SERVER_SETTINGS.providers.codex,
            binaryPath: "/legacy/codex",
          },
        },
        providerInstances: {
          [codexId]: {
            driver: decodeProviderDriverKind("codex"),
            config: {
              homePath: "/workspace/.codex",
            },
          },
          [codex2Id]: {
            driver: decodeProviderDriverKind("codex"),
            config: {
              binaryPath: "/opt/codex-2",
            },
          },
        },
      },
      provider: "codex",
      title: "Codex",
    });

    expect(instanceId).toBe(codex3Id);
    expect(patch.providerInstances?.[codex3Id]).toEqual({
      driver: decodeProviderDriverKind("codex"),
      enabled: true,
      displayName: "Codex 3",
      config: {
        ...DEFAULT_SERVER_SETTINGS.providers.codex,
        binaryPath: "/legacy/codex",
        homePath: "/workspace/.codex",
      },
    });
  });

  it("deletes a custom provider instance without touching others", () => {
    const codexId = decodeProviderInstanceId("codex");
    const customId = decodeProviderInstanceId("codex_work");
    const patch = buildDeleteProviderInstancePatch({
      settings: {
        providerInstances: {
          [codexId]: {
            driver: decodeProviderDriverKind("codex"),
          },
          [customId]: {
            driver: decodeProviderDriverKind("codex"),
            displayName: "Work",
          },
        },
      },
      instanceId: customId,
    });

    expect(patch.providerInstances?.[customId]).toBeUndefined();
    expect(patch.providerInstances?.[codexId]).toEqual({
      driver: decodeProviderDriverKind("codex"),
    });
  });

  it("updates a custom provider instance envelope and config in place", () => {
    const customId = decodeProviderInstanceId("claudeAgent_work");
    const patch = buildProviderInstanceUpdatePatch({
      settings: {
        providerInstances: {
          [customId]: {
            driver: decodeProviderDriverKind("claudeAgent"),
            displayName: "Work Claude",
            config: {
              binaryPath: "/usr/bin/claude",
              homePath: "/Users/maria",
            },
          },
        },
      },
      instanceId: customId,
      configPatch: {
        homePath: "/Users/maria/.claude-work",
        launchArgs: "--chrome",
      },
      instancePatch: {
        displayName: "Claude Work",
        enabled: false,
      },
    });

    expect(patch.providerInstances?.[customId]).toEqual({
      driver: decodeProviderDriverKind("claudeAgent"),
      displayName: "Claude Work",
      enabled: false,
      config: {
        binaryPath: "/usr/bin/claude",
        homePath: "/Users/maria/.claude-work",
        launchArgs: "--chrome",
      },
    });
  });

  it("clears empty custom provider instance metadata", () => {
    const customId = decodeProviderInstanceId("codex_work");
    const patch = buildProviderInstanceUpdatePatch({
      settings: {
        providerInstances: {
          [customId]: {
            driver: decodeProviderDriverKind("codex"),
            displayName: "Work",
            accentColor: "#112233",
          },
        },
      },
      instanceId: customId,
      instancePatch: {
        displayName: undefined,
        accentColor: undefined,
      },
    });

    expect(patch.providerInstances?.[customId]).toEqual({
      driver: decodeProviderDriverKind("codex"),
      config: {},
    });
  });
});

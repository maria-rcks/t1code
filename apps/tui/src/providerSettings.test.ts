import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";
import { Schema } from "effect";
import {
  buildDefaultProviderInstanceUpdatePatch,
  buildResetDefaultProviderInstancesPatch,
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
      },
    });

    expect(patch.providerInstances?.[instanceId]).toEqual({
      driver: decodeProviderDriverKind("claudeAgent"),
      enabled: false,
      config: {
        ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
        launchArgs: "--chrome",
      },
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
});

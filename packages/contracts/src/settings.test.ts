import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProviderInstanceId } from "./providerInstance";
import { DEFAULT_SERVER_SETTINGS, ServerSettings, ServerSettingsPatch } from "./settings";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);

describe("ServerSettings.providerInstances", () => {
  it("defaults to an empty record so legacy configs without the key still decode", () => {
    expect(DEFAULT_SERVER_SETTINGS.providerInstances).toEqual({});
  });

  it("decodes a fully empty config without complaint", () => {
    const decoded = decodeServerSettings({});

    expect(decoded.providerInstances).toEqual({});
    expect(decoded.providers.codex.enabled).toBe(true);
    expect(decoded.providers.cursor.enabled).toBe(false);
    expect(decoded.textGenerationModelSelection).toEqual({
      instanceId: decodeProviderInstanceId("codex"),
      model: "gpt-5.4-mini",
    });
  });

  it("decodes a multi-instance map mixing first-party and fork drivers", () => {
    const decoded = decodeServerSettings({
      providerInstances: {
        codex_personal: {
          driver: "codex",
          displayName: "Codex (personal)",
          config: { homePath: "~/.codex_personal" },
        },
        codex_work: {
          driver: "codex",
          config: { homePath: "~/.codex_work" },
        },
        ollama_local: {
          driver: "ollama",
          displayName: "Ollama (local)",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });

    expect(decoded.providerInstances[decodeProviderInstanceId("codex_personal")]?.driver).toBe(
      "codex",
    );
    expect(decoded.providerInstances[decodeProviderInstanceId("codex_work")]?.config).toEqual({
      homePath: "~/.codex_work",
    });
    expect(decoded.providerInstances[decodeProviderInstanceId("ollama_local")]?.driver).toBe(
      "ollama",
    );
    expect(decoded.providerInstances[decodeProviderInstanceId("ollama_local")]?.config).toEqual({
      endpoint: "http://localhost:11434",
    });
  });

  it("rejects instance keys that violate the slug pattern", () => {
    expect(() =>
      decodeServerSettings({
        providerInstances: { "1bad": { driver: "codex" } },
      }),
    ).toThrow();
  });
});

describe("ServerSettings textGenerationModelSelection", () => {
  it("promotes legacy provider selections into instance selections", () => {
    const decoded = decodeServerSettings({
      textGenerationModelSelection: {
        provider: "claudeAgent",
        model: "claude-haiku-4-5",
        options: { effort: "low", fastMode: true, unused: null },
      },
    });

    expect(decoded.textGenerationModelSelection).toEqual({
      instanceId: decodeProviderInstanceId("claudeAgent"),
      model: "claude-haiku-4-5",
      options: [
        { id: "effort", value: "low" },
        { id: "fastMode", value: true },
      ],
    });
  });
});

describe("ServerSettingsPatch.providerInstances", () => {
  it("treats providerInstances as an optional whole-map replacement", () => {
    const patch = decodeServerSettingsPatch({});
    expect(patch.providerInstances).toBeUndefined();

    const replacement = decodeServerSettingsPatch({
      providerInstances: {
        codex_personal: { driver: "codex", config: { homePath: "~/.codex" } },
      },
    });
    expect(replacement.providerInstances).toBeDefined();
    expect(
      replacement.providerInstances?.[decodeProviderInstanceId("codex_personal")]?.driver,
    ).toBe("codex");
  });

  it("preserves a fork-defined driver entry through patch decoding", () => {
    const patch = decodeServerSettingsPatch({
      providerInstances: {
        ollama_local: {
          driver: "ollama",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });
    expect(patch.providerInstances?.[decodeProviderInstanceId("ollama_local")]?.driver).toBe(
      "ollama",
    );
  });
});

describe("ServerSettingsPatch string normalization", () => {
  it("trims string settings while decoding patches", () => {
    const patch = decodeServerSettingsPatch({
      addProjectBaseDirectory: "  ~/Development  ",
      textGenerationModelSelection: { model: "  gpt-5.4-mini  " },
      observability: {
        otlpTracesUrl: "  http://localhost:4318/v1/traces  ",
      },
      providers: {
        codex: {
          binaryPath: "  /opt/homebrew/bin/codex  ",
          homePath: "  ~/.codex  ",
        },
      },
      providerInstances: {
        codex_personal: {
          driver: "  codex  ",
          displayName: "  Codex Personal  ",
          config: { homePath: "  ~/.codex-personal  " },
        },
      },
    });

    expect(patch.addProjectBaseDirectory).toBe("~/Development");
    expect(patch.textGenerationModelSelection?.model).toBe("gpt-5.4-mini");
    expect(patch.observability?.otlpTracesUrl).toBe("http://localhost:4318/v1/traces");
    expect(patch.providers?.codex?.binaryPath).toBe("/opt/homebrew/bin/codex");
    expect(patch.providers?.codex?.homePath).toBe("~/.codex");
    expect(patch.providerInstances?.[decodeProviderInstanceId("codex_personal")]?.driver).toBe(
      "codex",
    );
    expect(patch.providerInstances?.[decodeProviderInstanceId("codex_personal")]?.displayName).toBe(
      "Codex Personal",
    );
    expect(patch.providerInstances?.[decodeProviderInstanceId("codex_personal")]?.config).toEqual({
      homePath: "  ~/.codex-personal  ",
    });
  });

  it("trims full server settings values while decoding", () => {
    const decoded = decodeServerSettings({
      addProjectBaseDirectory: "  ~/Development  ",
      providers: {
        codex: {
          binaryPath: "  /opt/homebrew/bin/codex  ",
        },
      },
    });

    expect(decoded.addProjectBaseDirectory).toBe("~/Development");
    expect(decoded.providers.codex.binaryPath).toBe("/opt/homebrew/bin/codex");
  });
});

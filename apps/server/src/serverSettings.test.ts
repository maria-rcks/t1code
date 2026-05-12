import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  ServerSettings,
  ServerSettingsPatch,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { assert, it } from "@effect/vitest";
import { Duration, Effect, FileSystem, Layer, Schema } from "effect";

import { ServerConfig } from "./config";
import { ServerSettingsLive, ServerSettingsService } from "./serverSettings";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);

const makeServerSettingsLayer = () =>
  ServerSettingsLive.pipe(
    Layer.provideMerge(
      Layer.fresh(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3code-server-settings-test-",
        }),
      ),
    ),
  );

it.layer(NodeServices.layer)("server settings", (it) => {
  it.effect("decodes nested settings patches", () =>
    Effect.sync(() => {
      assert.deepEqual(
        decodeServerSettingsPatch({ providers: { codex: { binaryPath: "/tmp/codex" } } }),
        {
          providers: { codex: { binaryPath: "/tmp/codex" } },
        },
      );

      assert.deepEqual(
        decodeServerSettingsPatch({
          textGenerationModelSelection: {
            options: [{ id: "fastMode", value: false }],
          },
        }),
        {
          textGenerationModelSelection: {
            options: [{ id: "fastMode", value: false }],
          },
        },
      );
    }),
  );

  it.effect("decodes legacy object-shaped textGenerationModelSelection.options", () =>
    Effect.sync(() => {
      const decoded = decodeServerSettings({
        textGenerationModelSelection: {
          provider: "codex",
          model: "gpt-5.4-mini",
          options: { reasoningEffort: "low" },
        },
      });

      assert.deepEqual(decoded.textGenerationModelSelection, {
        instanceId: decodeProviderInstanceId("codex"),
        model: "gpt-5.4-mini",
        options: [{ id: "reasoningEffort", value: "low" }],
      });
    }),
  );

  it.effect("deep merges nested settings updates without dropping siblings", () =>
    Effect.gen(function* () {
      const serverSettings = yield* ServerSettingsService;

      yield* serverSettings.updateSettings({
        providers: {
          codex: {
            binaryPath: "/usr/local/bin/codex",
            homePath: "/Users/maria/.codex",
          },
          claudeAgent: {
            binaryPath: "/usr/local/bin/claude",
            customModels: ["claude-custom"],
          },
        },
        textGenerationModelSelection: {
          instanceId: decodeProviderInstanceId("codex"),
          model: DEFAULT_SERVER_SETTINGS.textGenerationModelSelection.model,
          options: [
            { id: "reasoningEffort", value: "high" },
            { id: "fastMode", value: true },
          ],
        },
      });

      const next = yield* serverSettings.updateSettings({
        providers: {
          codex: {
            binaryPath: "/opt/homebrew/bin/codex",
          },
        },
        textGenerationModelSelection: {
          options: [{ id: "fastMode", value: false }],
        },
      });

      assert.deepEqual(next.providers.codex, {
        enabled: true,
        binaryPath: "/opt/homebrew/bin/codex",
        homePath: "/Users/maria/.codex",
        shadowHomePath: "",
        customModels: [],
      });
      assert.deepEqual(next.providers.claudeAgent, {
        enabled: true,
        binaryPath: "/usr/local/bin/claude",
        homePath: "",
        customModels: ["claude-custom"],
        launchArgs: "",
      });
      assert.deepEqual(
        next.textGenerationModelSelection,
        createModelSelection(
          decodeProviderInstanceId("codex"),
          DEFAULT_SERVER_SETTINGS.textGenerationModelSelection.model,
          [
            { id: "reasoningEffort", value: "high" },
            { id: "fastMode", value: false },
          ],
        ),
      );
    }).pipe(Effect.provide(makeServerSettingsLayer())),
  );

  it.effect("preserves custom provider instance text generation selections", () =>
    Effect.gen(function* () {
      const serverSettings = yield* ServerSettingsService;
      const instanceId = decodeProviderInstanceId("claude_openrouter");

      const next = yield* serverSettings.updateSettings({
        providerInstances: {
          [instanceId]: {
            driver: decodeProviderDriverKind("claudeAgent"),
            enabled: true,
            config: { customModels: ["openai/gpt-5.5"] },
          },
        },
        textGenerationModelSelection: {
          instanceId,
          model: "openai/gpt-5.5",
        },
      });

      assert.deepEqual(next.textGenerationModelSelection, {
        instanceId,
        model: "openai/gpt-5.5",
      });
    }).pipe(Effect.provide(makeServerSettingsLayer())),
  );

  it.effect("falls back when selected text generation provider is disabled", () =>
    Effect.gen(function* () {
      const serverSettings = yield* ServerSettingsService;

      const next = yield* serverSettings.updateSettings({
        providers: {
          codex: { enabled: true },
          claudeAgent: { enabled: false },
        },
        textGenerationModelSelection: {
          instanceId: decodeProviderInstanceId("claudeAgent"),
          model: "claude-haiku-4-5",
        },
      });

      assert.deepEqual(next.textGenerationModelSelection, {
        instanceId: decodeProviderInstanceId("codex"),
        model: "gpt-5.4-mini",
      });
    }).pipe(Effect.provide(makeServerSettingsLayer())),
  );

  it.effect("redacts provider environment secrets on disk and materializes them on read", () =>
    Effect.gen(function* () {
      const serverSettings = yield* ServerSettingsService;
      const config = yield* ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const instanceId = decodeProviderInstanceId("codex_personal");

      const updated = yield* serverSettings.updateSettings({
        providerInstances: {
          [instanceId]: {
            driver: decodeProviderDriverKind("codex"),
            environment: [
              { name: "OPENAI_API_KEY", value: "sk-test", sensitive: true },
              { name: "OPENAI_BASE_URL", value: "https://api.example.test", sensitive: false },
            ],
          },
        },
      });

      assert.deepEqual(updated.providerInstances[instanceId]?.environment, [
        { name: "OPENAI_API_KEY", value: "sk-test", sensitive: true, valueRedacted: true },
        { name: "OPENAI_BASE_URL", value: "https://api.example.test", sensitive: false },
      ]);

      const persisted = yield* fs.readFileString(config.settingsPath);
      assert.strictEqual(persisted.includes("sk-test"), false);
      assert.strictEqual(persisted.includes('"valueRedacted": true'), true);

      const readBack = yield* serverSettings.getSettings;
      assert.deepEqual(readBack.providerInstances[instanceId]?.environment, [
        { name: "OPENAI_API_KEY", value: "sk-test", sensitive: true, valueRedacted: true },
        { name: "OPENAI_BASE_URL", value: "https://api.example.test", sensitive: false },
      ]);
    }).pipe(Effect.provide(makeServerSettingsLayer())),
  );

  it.effect("supports layerTest overrides", () =>
    Effect.gen(function* () {
      const serverSettings = yield* ServerSettingsService;
      const settings = yield* serverSettings.getSettings;

      assert.equal(Duration.toMillis(settings.automaticGitFetchInterval), 5_000);
      assert.equal(settings.providers.codex.homePath, "/tmp/codex-home");
    }).pipe(
      Effect.provide(
        ServerSettingsService.layerTest({
          automaticGitFetchInterval: Duration.seconds(5),
          providers: {
            codex: { homePath: "/tmp/codex-home" },
          },
        }),
      ),
    ),
  );
});

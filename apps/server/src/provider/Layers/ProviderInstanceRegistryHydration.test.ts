import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { ServerConfig } from "../../config";
import { ServerSettingsService } from "../../serverSettings";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "./ProviderEventLoggers";
import {
  deriveProviderInstanceConfigMap,
  ProviderInstanceRegistryHydrationLive,
} from "./ProviderInstanceRegistryHydration";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const codexInstanceId = decodeProviderInstanceId("codex");
const claudeInstanceId = decodeProviderInstanceId("claudeAgent");
const cursorInstanceId = decodeProviderInstanceId("cursor");
const opencodeInstanceId = decodeProviderInstanceId("opencode");
const codexDriverKind = decodeProviderDriverKind("codex");

const TestLayer = (settingsOverrides: Parameters<typeof ServerSettingsService.layerTest>[0]) =>
  ProviderInstanceRegistryHydrationLive.pipe(
    Layer.provide(ServerSettingsService.layerTest(settingsOverrides)),
    Layer.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-provider-hydration-test-" }).pipe(
        Layer.provide(NodeServices.layer),
      ),
    ),
    Layer.provide(Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers)),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(NodeServices.layer),
  );

describe("ProviderInstanceRegistryHydration", () => {
  it("derives default legacy provider instances from provider settings", () => {
    const map = deriveProviderInstanceConfigMap(DEFAULT_SERVER_SETTINGS);
    assert.equal(map[codexInstanceId]?.driver, "codex");
    assert.equal(map[claudeInstanceId]?.driver, "claudeAgent");
    assert.equal(map[cursorInstanceId]?.driver, "cursor");
    assert.equal(map[opencodeInstanceId]?.driver, "opencode");
  });

  it.effect("hydrates registered legacy providers and shadows missing drivers", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderInstanceRegistry;
      const instances = yield* registry.listInstances;
      assert.deepEqual(
        instances.map((instance) => instance.instanceId),
        ["codex", "claudeAgent"],
      );
      const unavailable = yield* registry.listUnavailable;
      assert.deepEqual(
        unavailable.map((provider) => provider.instanceId),
        ["cursor", "opencode"],
      );
      assert.deepEqual(
        unavailable.map((provider) => provider.driver),
        ["cursor", "opencode"],
      );
      assert.ok(
        unavailable.every(
          (provider) =>
            provider.availability === "unavailable" &&
            provider.unavailableReason?.includes("is not registered in this build"),
        ),
      );
    }).pipe(Effect.scoped, Effect.provide(TestLayer({}))),
  );

  it("derives explicit entries without overwriting them", () => {
    const map = deriveProviderInstanceConfigMap({
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [codexInstanceId]: {
          driver: codexDriverKind,
          displayName: "Explicit Codex",
          config: { binaryPath: "/custom/codex" },
        },
      },
      observability: { otlpTracesUrl: "", otlpMetricsUrl: "" },
    });

    const explicitCodex = map[codexInstanceId];
    assert.ok(explicitCodex);
    assert.equal(explicitCodex.displayName, "Explicit Codex");
    assert.equal((explicitCodex.config as { binaryPath?: string }).binaryPath, "/custom/codex");
    assert.equal(map[claudeInstanceId]?.driver, "claudeAgent");
    assert.equal(map[cursorInstanceId]?.driver, "cursor");
    assert.equal(map[opencodeInstanceId]?.driver, "opencode");
  });
});

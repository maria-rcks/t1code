import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { ServerConfig } from "../../config";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "../Layers/ProviderEventLoggers";
import { CodexDriver } from "./CodexDriver";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

const TestLayer = Layer.mergeAll(
  NodeServices.layer,
  FetchHttpClient.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-codex-driver-test-" }).pipe(
    Layer.provide(NodeServices.layer),
  ),
  Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers),
);

describe("CodexDriver", () => {
  it("exposes Codex driver metadata and defaults", () => {
    assert.equal(CodexDriver.driverKind, "codex");
    assert.equal(CodexDriver.metadata.displayName, "Codex");
    assert.equal(CodexDriver.metadata.supportsMultipleInstances, true);
    assert.equal(CodexDriver.defaultConfig().binaryPath, "codex");
  });

  it.effect("creates an isolated provider instance bundle", () =>
    Effect.gen(function* () {
      const instance = yield* CodexDriver.create({
        instanceId: decodeProviderInstanceId("codex_personal"),
        displayName: "Personal Codex",
        accentColor: "#0ea5e9",
        environment: [],
        enabled: true,
        config: {
          ...CodexDriver.defaultConfig(),
          binaryPath: "codex",
        },
      });

      assert.equal(instance.instanceId, "codex_personal");
      assert.equal(instance.driverKind, "codex");
      assert.equal(instance.displayName, "Personal Codex");
      assert.equal(instance.accentColor, "#0ea5e9");
      assert.equal(instance.enabled, true);
      assert.equal(instance.continuationIdentity.driverKind, "codex");
      assert.equal(typeof instance.snapshot.getSnapshot, "object");
      assert.equal(instance.adapter.provider, "codex");
      assert.equal(instance.adapter.capabilities.sessionModelSwitch, "in-session");
      assert.equal(typeof instance.textGeneration.generateThreadTitle, "function");
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
  );
});

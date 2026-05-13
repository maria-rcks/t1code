import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import { ServerConfig } from "../../config";
import { NoOpProviderEventLoggers, ProviderEventLoggers } from "../Layers/ProviderEventLoggers";
import { ClaudeDriver } from "./ClaudeDriver";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

const TestLayer = Layer.mergeAll(
  NodeServices.layer,
  FetchHttpClient.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-claude-driver-test-" }).pipe(
    Layer.provide(NodeServices.layer),
  ),
  Layer.succeed(ProviderEventLoggers, NoOpProviderEventLoggers),
);

describe("ClaudeDriver", () => {
  it("exposes Claude driver metadata and defaults", () => {
    assert.equal(ClaudeDriver.driverKind, "claudeAgent");
    assert.equal(ClaudeDriver.metadata.displayName, "Claude");
    assert.equal(ClaudeDriver.metadata.supportsMultipleInstances, true);
    assert.equal(ClaudeDriver.defaultConfig().binaryPath, "claude");
  });

  it.effect("creates an isolated provider instance bundle", () =>
    Effect.gen(function* () {
      const instance = yield* ClaudeDriver.create({
        instanceId: decodeProviderInstanceId("claude_work"),
        displayName: "Work Claude",
        accentColor: "#f97316",
        environment: [],
        enabled: true,
        config: {
          ...ClaudeDriver.defaultConfig(),
          binaryPath: "claude",
        },
      });

      assert.equal(instance.instanceId, "claude_work");
      assert.equal(instance.driverKind, "claudeAgent");
      assert.equal(instance.displayName, "Work Claude");
      assert.equal(instance.accentColor, "#f97316");
      assert.equal(instance.enabled, true);
      assert.equal(instance.continuationIdentity.driverKind, "claudeAgent");
      assert.equal(instance.continuationIdentity.continuationKey.startsWith("claude:home:"), true);
      assert.equal(typeof instance.snapshot.getSnapshot, "object");
      assert.equal(instance.adapter.provider, "claudeAgent");
      assert.equal(instance.adapter.capabilities.sessionModelSwitch, "in-session");
      assert.equal(typeof instance.textGeneration.generateThreadTitle, "function");
    }).pipe(Effect.scoped, Effect.provide(TestLayer)),
  );
});

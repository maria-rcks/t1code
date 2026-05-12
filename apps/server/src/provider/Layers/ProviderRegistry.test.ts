import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import type { ProviderInstance } from "../ProviderDriver.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderRegistry } from "../Services/ProviderRegistry.ts";
import { makeProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { ProviderRegistryLive } from "./ProviderRegistry.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const CODEX_DRIVER = decodeProviderDriverKind("codex");
const GHOST_DRIVER = decodeProviderDriverKind("ghostDriver");
const CODEX_INSTANCE_ID = decodeProviderInstanceId("codex");
const GHOST_INSTANCE_ID = decodeProviderInstanceId("ghostDriver");

const maintenanceCapabilities = makeProviderMaintenanceCapabilities({
  provider: CODEX_DRIVER,
  packageName: "@openai/codex",
  updateExecutable: "npm",
  updateArgs: ["install", "-g", "@openai/codex@latest"],
  updateLockKey: "npm-global",
});

const makeProvider = (overrides: Partial<ServerProvider> = {}): ServerProvider => ({
  instanceId: CODEX_INSTANCE_ID,
  driver: CODEX_DRIVER,
  displayName: "Codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-04-10T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  ...overrides,
});

const unavailableProvider: ServerProvider = {
  instanceId: GHOST_INSTANCE_ID,
  driver: GHOST_DRIVER,
  displayName: "Ghost",
  enabled: false,
  installed: false,
  version: null,
  status: "disabled",
  auth: { status: "unknown" },
  checkedAt: "2026-04-10T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  availability: "unavailable",
  unavailableReason: "Driver 'ghostDriver' is not registered in this build.",
};

const fail = (message: string) => Effect.die(new Error(message));

function makeInstance(input: {
  readonly snapshotRef: Ref.Ref<ServerProvider>;
  readonly refreshRef: Ref.Ref<ServerProvider>;
}): ProviderInstance {
  return {
    instanceId: CODEX_INSTANCE_ID,
    driverKind: CODEX_DRIVER,
    continuationIdentity: {
      driverKind: CODEX_DRIVER,
      continuationKey: "codex:instance:codex",
    },
    displayName: "Codex",
    enabled: true,
    snapshot: {
      maintenanceCapabilities,
      getSnapshot: Ref.get(input.snapshotRef),
      refresh: Ref.get(input.refreshRef),
      streamChanges: Stream.empty,
    },
    adapter: {
      provider: "codex",
      capabilities: { sessionModelSwitch: "unsupported" },
      startSession: () => fail("not implemented"),
      sendTurn: () => fail("not implemented"),
      interruptTurn: () => fail("not implemented"),
      respondToRequest: () => fail("not implemented"),
      respondToUserInput: () => fail("not implemented"),
      stopSession: () => fail("not implemented"),
      listSessions: () => Effect.succeed([]),
      hasSession: () => Effect.succeed(false),
      readThread: () => fail("not implemented"),
      rollbackThread: () => fail("not implemented"),
      stopAll: () => Effect.void,
      streamEvents: Stream.empty,
    },
    textGeneration: {
      generateCommitMessage: () => fail("not implemented"),
      generatePrContent: () => fail("not implemented"),
      generateBranchName: () => fail("not implemented"),
      generateThreadTitle: () => fail("not implemented"),
    },
  };
}

function makeTestLayer(input: {
  readonly instance: ProviderInstance;
  readonly unavailable?: ReadonlyArray<ServerProvider>;
}) {
  const instanceRegistryLayer = Layer.effect(
    ProviderInstanceRegistry,
    Effect.gen(function* () {
      const changes = yield* Effect.acquireRelease(PubSub.unbounded<void>(), PubSub.shutdown);
      return {
        getInstance: (instanceId) =>
          Effect.succeed(instanceId === input.instance.instanceId ? input.instance : undefined),
        listInstances: Effect.succeed([input.instance]),
        listUnavailable: Effect.succeed(input.unavailable ?? []),
        get streamChanges() {
          return Stream.fromPubSub(changes);
        },
        get subscribeChanges() {
          return PubSub.subscribe(changes);
        },
      };
    }),
  );

  return ProviderRegistryLive.pipe(
    Layer.provideMerge(instanceRegistryLayer),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "provider-registry-" })),
    Layer.provideMerge(NodeServices.layer),
  );
}

describe("ProviderRegistryLive", () => {
  it.effect("aggregates live and unavailable provider snapshots", () =>
    Effect.gen(function* () {
      const snapshotRef = yield* Ref.make(makeProvider({ version: "fallback" }));
      const refreshRef = yield* Ref.make(makeProvider({ version: "refreshed" }));
      const instance = makeInstance({ snapshotRef, refreshRef });

      yield* Effect.gen(function* () {
        const registry = yield* ProviderRegistry;
        const providers = yield* registry.getProviders;

        assert.deepStrictEqual(
          providers.map((provider) => provider.instanceId),
          [CODEX_INSTANCE_ID, GHOST_INSTANCE_ID],
        );
        assert.strictEqual(
          providers.find((provider) => provider.instanceId === CODEX_INSTANCE_ID)?.version,
          "refreshed",
        );
        assert.strictEqual(
          providers.find((provider) => provider.instanceId === GHOST_INSTANCE_ID)?.availability,
          "unavailable",
        );
      }).pipe(Effect.provide(makeTestLayer({ instance, unavailable: [unavailableProvider] })));
    }),
  );

  it.effect("refreshes a specific provider instance and applies volatile update state", () =>
    Effect.gen(function* () {
      const snapshotRef = yield* Ref.make(makeProvider({ version: "initial" }));
      const refreshRef = yield* Ref.make(makeProvider({ version: "1.0.1" }));
      const instance = makeInstance({ snapshotRef, refreshRef });

      yield* Effect.gen(function* () {
        const registry = yield* ProviderRegistry;
        yield* Ref.set(refreshRef, makeProvider({ version: "1.0.2" }));
        const refreshed = yield* registry.refreshInstance(CODEX_INSTANCE_ID);
        assert.strictEqual(refreshed[0]?.version, "1.0.2");

        const withUpdateState = yield* registry.setProviderMaintenanceActionState({
          instanceId: CODEX_INSTANCE_ID,
          action: "update",
          state: {
            status: "running",
            startedAt: "2026-04-10T00:00:00.000Z",
            finishedAt: null,
            message: "Updating provider.",
            output: null,
          },
        });
        assert.strictEqual(withUpdateState[0]?.updateState?.status, "running");

        const cleared = yield* registry.setProviderMaintenanceActionState({
          instanceId: CODEX_INSTANCE_ID,
          action: "update",
          state: null,
        });
        assert.strictEqual(cleared[0]?.updateState, undefined);
      }).pipe(Effect.provide(makeTestLayer({ instance })));
    }),
  );
});

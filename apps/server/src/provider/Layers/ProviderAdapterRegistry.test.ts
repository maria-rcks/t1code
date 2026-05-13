import { assert, describe, it, vi } from "@effect/vitest";
import { assertFailure } from "@effect/vitest/utils";
import { ProviderDriverKind, ProviderInstanceId, type ProviderKind } from "@t3tools/contracts";
import { Effect, Layer, PubSub, Schema, Stream } from "effect";

import { ProviderUnsupportedError } from "../Errors.ts";
import type { ProviderInstance } from "../ProviderDriver.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import { ProviderAdapterRegistry } from "../Services/ProviderAdapterRegistry.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderAdapterRegistryFromInstanceRegistryLive } from "./ProviderAdapterRegistry.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

const codexInstanceId = decodeProviderInstanceId("codex");
const codexPersonalInstanceId = decodeProviderInstanceId("codex_personal");
const codexDriverKind = decodeProviderDriverKind("codex");

const makeFakeAdapter = (provider: ProviderKind): ProviderAdapterShape<never> => ({
  provider,
  capabilities: { sessionModelSwitch: "in-session" },
  startSession: vi.fn(),
  sendTurn: vi.fn(),
  interruptTurn: vi.fn(),
  respondToRequest: vi.fn(),
  respondToUserInput: vi.fn(),
  stopSession: vi.fn(),
  listSessions: vi.fn(),
  hasSession: vi.fn(),
  readThread: vi.fn(),
  rollbackThread: vi.fn(),
  stopAll: vi.fn(),
  streamEvents: Stream.empty,
});

const fakeCodexAdapter = makeFakeAdapter("codex");
const fakeCodexPersonalAdapter = makeFakeAdapter("codex");

const makeFakeInstance = (input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly adapter: ProviderAdapterShape<never>;
}): ProviderInstance => ({
  instanceId: input.instanceId,
  driverKind: codexDriverKind,
  continuationIdentity: {
    driverKind: codexDriverKind,
    continuationKey: `codex:test:${input.instanceId}`,
  },
  displayName: input.displayName,
  enabled: true,
  snapshot: {
    maintenanceCapabilities: { provider: codexDriverKind, packageName: null, update: null },
    getSnapshot: Effect.die("unused"),
    refresh: Effect.die("unused"),
    streamChanges: Stream.empty,
  },
  adapter: input.adapter,
  textGeneration: {
    generateCommitMessage: vi.fn(),
    generatePrContent: vi.fn(),
    generateBranchName: vi.fn(),
    generateThreadTitle: vi.fn(),
  },
});

const instances = [
  makeFakeInstance({
    instanceId: codexInstanceId,
    displayName: "Default Codex",
    adapter: fakeCodexAdapter,
  }),
  makeFakeInstance({
    instanceId: codexPersonalInstanceId,
    displayName: "Personal Codex",
    adapter: fakeCodexPersonalAdapter,
  }),
];

const FakeInstanceRegistryLayer = Layer.effect(
  ProviderInstanceRegistry,
  Effect.gen(function* () {
    const changes = yield* PubSub.unbounded<void>();
    return {
      getInstance: (instanceId) =>
        Effect.succeed(instances.find((instance) => instance.instanceId === instanceId)),
      listInstances: Effect.succeed(instances),
      listUnavailable: Effect.succeed([]),
      streamChanges: Stream.fromPubSub(changes),
      subscribeChanges: PubSub.subscribe(changes),
    };
  }),
);

const TestLayer = ProviderAdapterRegistryFromInstanceRegistryLive.pipe(
  Layer.provide(FakeInstanceRegistryLayer),
);

describe("ProviderAdapterRegistryLive", () => {
  it.effect("resolves adapters by instance id and legacy provider kind", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderAdapterRegistry;
      assert.equal(
        yield* registry.getByInstance!(codexPersonalInstanceId),
        fakeCodexPersonalAdapter,
      );
      assert.equal(yield* registry.getByProvider("codex"), fakeCodexAdapter);
      assert.deepEqual(yield* registry.listInstances!(), [
        codexInstanceId,
        codexPersonalInstanceId,
      ]);
      assert.deepEqual(yield* registry.listProviders(), ["codex"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("returns instance routing metadata", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderAdapterRegistry;
      const info = yield* registry.getInstanceInfo!(codexPersonalInstanceId);
      assert.equal(info.instanceId, codexPersonalInstanceId);
      assert.equal(info.driverKind, codexDriverKind);
      assert.equal(info.displayName, "Personal Codex");
      assert.equal(info.continuationIdentity.continuationKey, "codex:test:codex_personal");
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("fails with ProviderUnsupportedError for unknown instances", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderAdapterRegistry;
      const adapter = yield* registry.getByInstance!(decodeProviderInstanceId("missing")).pipe(
        Effect.result,
      );
      assertFailure(adapter, new ProviderUnsupportedError({ provider: "missing" }));
    }).pipe(Effect.provide(TestLayer)),
  );
});

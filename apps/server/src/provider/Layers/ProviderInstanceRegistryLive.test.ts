import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfigMap,
  type ServerProvider,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  defaultProviderContinuationIdentity,
  type AnyProviderDriver,
  type ProviderDriverCreateInput,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { makeProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { makeProviderInstanceRegistry } from "./ProviderInstanceRegistryLive.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);
const CODEX_DRIVER = decodeProviderDriverKind("codex");
const GHOST_DRIVER = decodeProviderDriverKind("ghostDriver");

const TestConfig = Schema.Struct({
  binaryPath: Schema.optionalKey(Schema.String),
  enabled: Schema.optionalKey(Schema.Boolean),
});
type TestConfig = typeof TestConfig.Type;

const maintenanceCapabilities = makeProviderMaintenanceCapabilities({
  provider: CODEX_DRIVER,
  packageName: "@openai/codex",
  updateExecutable: "npm",
  updateArgs: ["install", "-g", "@openai/codex@latest"],
  updateLockKey: "npm-global",
});

const fail = (message: string) => Effect.die(new Error(message));

function makeSnapshot(input: {
  readonly instanceId: ProviderInstanceId;
  readonly displayName: string | undefined;
  readonly enabled: boolean;
  readonly binaryPath: string | undefined;
}): ServerProvider {
  return {
    instanceId: input.instanceId,
    driver: CODEX_DRIVER,
    displayName: input.displayName,
    enabled: input.enabled,
    installed: input.enabled,
    version: input.binaryPath ?? null,
    status: input.enabled ? "ready" : "disabled",
    auth: { status: "unknown" },
    checkedAt: "2026-04-10T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
}

function makeFakeDriver(
  closedIdsRef: Ref.Ref<ReadonlyArray<ProviderInstanceId>>,
): AnyProviderDriver {
  return {
    driverKind: CODEX_DRIVER,
    metadata: { displayName: "Codex" },
    configSchema: TestConfig,
    defaultConfig: () => ({}),
    create: (input: ProviderDriverCreateInput<TestConfig>) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Ref.update(closedIdsRef, (closedIds) => [...closedIds, input.instanceId]),
        );
        const snapshot = makeSnapshot({
          instanceId: input.instanceId,
          displayName: input.displayName,
          enabled: input.enabled,
          binaryPath: input.config.binaryPath,
        });
        const instance = {
          instanceId: input.instanceId,
          driverKind: CODEX_DRIVER,
          continuationIdentity: defaultProviderContinuationIdentity({
            driverKind: CODEX_DRIVER,
            instanceId: input.instanceId,
          }),
          displayName: input.displayName,
          accentColor: input.accentColor,
          enabled: input.enabled,
          snapshot: {
            maintenanceCapabilities,
            getSnapshot: Effect.succeed(snapshot),
            refresh: Effect.succeed(snapshot),
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
        } satisfies ProviderInstance;
        return instance;
      }),
  };
}

describe("ProviderInstanceRegistryLive", () => {
  it.effect("boots multiple independent instances for one driver", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const closedIdsRef = yield* Ref.make<ReadonlyArray<ProviderInstanceId>>([]);
        const personalId = decodeProviderInstanceId("codex_personal");
        const workId = decodeProviderInstanceId("codex_work");
        const configMap: ProviderInstanceConfigMap = {
          [personalId]: {
            driver: CODEX_DRIVER,
            displayName: "Codex (personal)",
            enabled: false,
            config: { binaryPath: "/opt/codex-personal/bin/codex" },
          },
          [workId]: {
            driver: CODEX_DRIVER,
            displayName: "Codex (work)",
            enabled: true,
            config: { binaryPath: "/opt/codex-work/bin/codex" },
          },
        };

        const { registry } = yield* makeProviderInstanceRegistry({
          drivers: [makeFakeDriver(closedIdsRef)],
          configMap,
        });

        const instances = yield* registry.listInstances;
        assert.deepStrictEqual(
          instances.map((instance) => instance.instanceId),
          [personalId, workId],
        );

        const personal = yield* registry.getInstance(personalId);
        const work = yield* registry.getInstance(workId);
        assert.ok(personal);
        assert.ok(work);
        assert.notStrictEqual(personal.adapter, work.adapter);
        assert.notStrictEqual(personal.snapshot, work.snapshot);
        assert.deepStrictEqual(yield* personal.snapshot.getSnapshot, {
          ...makeSnapshot({
            instanceId: personalId,
            displayName: "Codex (personal)",
            enabled: false,
            binaryPath: "/opt/codex-personal/bin/codex",
          }),
        });
        assert.deepStrictEqual(yield* work.snapshot.getSnapshot, {
          ...makeSnapshot({
            instanceId: workId,
            displayName: "Codex (work)",
            enabled: true,
            binaryPath: "/opt/codex-work/bin/codex",
          }),
        });
        assert.deepStrictEqual(yield* registry.listUnavailable, []);
      }),
    ),
  );

  it.effect("shadows instances whose driver is not registered", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const closedIdsRef = yield* Ref.make<ReadonlyArray<ProviderInstanceId>>([]);
        const codexId = decodeProviderInstanceId("codex");
        const ghostId = decodeProviderInstanceId("ghostDriver");
        const configMap: ProviderInstanceConfigMap = {
          [codexId]: {
            driver: CODEX_DRIVER,
            enabled: false,
            config: {},
          },
          [ghostId]: {
            driver: GHOST_DRIVER,
            displayName: "Ghost Driver",
            enabled: false,
            config: { arbitrary: "payload" },
          },
        };

        const { registry } = yield* makeProviderInstanceRegistry({
          drivers: [makeFakeDriver(closedIdsRef)],
          configMap,
        });

        const instances = yield* registry.listInstances;
        assert.strictEqual(instances.length, 1);
        assert.strictEqual(instances[0]?.instanceId, codexId);

        const unavailable = yield* registry.listUnavailable;
        assert.strictEqual(unavailable.length, 1);
        assert.strictEqual(unavailable[0]?.instanceId, ghostId);
        assert.strictEqual(unavailable[0]?.driver, GHOST_DRIVER);
        assert.strictEqual(unavailable[0]?.availability, "unavailable");
        assert.match(unavailable[0]?.unavailableReason ?? "", /ghostDriver/);
      }),
    ),
  );

  it.effect("reconciles changed instances by closing the previous instance scope", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const closedIdsRef = yield* Ref.make<ReadonlyArray<ProviderInstanceId>>([]);
        const codexId = decodeProviderInstanceId("codex");
        const initialConfigMap: ProviderInstanceConfigMap = {
          [codexId]: {
            driver: CODEX_DRIVER,
            config: { binaryPath: "/bin/codex-old" },
          },
        };
        const { registry, mutator } = yield* makeProviderInstanceRegistry({
          drivers: [makeFakeDriver(closedIdsRef)],
          configMap: initialConfigMap,
        });

        yield* mutator.reconcile({
          [codexId]: {
            driver: CODEX_DRIVER,
            config: { binaryPath: "/bin/codex-new" },
          },
        } as ProviderInstanceConfigMap);

        assert.deepStrictEqual(yield* Ref.get(closedIdsRef), [codexId]);
        const instance = yield* registry.getInstance(codexId);
        assert.ok(instance);
        assert.strictEqual((yield* instance.snapshot.getSnapshot).version, "/bin/codex-new");
      }),
    ),
  );
});

import { assert, describe, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { Effect, Layer, Sink, Stream } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { ChildProcessSpawner } from "effect/unstable/process";

import type { ProviderInstance } from "./ProviderDriver";
import { ProviderInstanceRegistry } from "./Services/ProviderInstanceRegistry";
import { makeProviderMaintenanceCapabilities } from "./providerMaintenance";
import {
  ProviderMaintenanceRunner,
  layer as ProviderMaintenanceRunnerLive,
} from "./providerMaintenanceRunner";

const encoder = new TextEncoder();
const codexDriver = ProviderDriverKind.makeUnsafe("codex");
const codexInstanceId = ProviderInstanceId.makeUnsafe("codex");

function provider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: codexInstanceId,
    driver: codexDriver,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    availability: "available",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

function makeHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

describe("ProviderMaintenanceRunner", () => {
  it.effect("runs one-click provider updates and records succeeded state", () => {
    const commands: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> = [];
    const initialProvider = provider({
      versionAdvisory: {
        status: "behind_latest",
        currentVersion: "1.0.0",
        latestVersion: "1.0.1",
        updateCommand: "npm install -g @openai/codex@latest",
        canUpdate: true,
        checkedAt: "2026-01-01T00:00:00.000Z",
        message: "Install the update now or review provider settings.",
      },
    });
    const refreshedProvider = provider({ version: "1.0.1" });
    const providerInstance = {
      instanceId: codexInstanceId,
      driverKind: codexDriver,
      snapshot: {
        maintenanceCapabilities: makeProviderMaintenanceCapabilities({
          provider: codexDriver,
          packageName: null,
          updateExecutable: "npm",
          updateArgs: ["install", "-g", "@openai/codex@latest"],
          updateLockKey: "npm-global",
        }),
        getSnapshot: Effect.succeed(initialProvider),
        refresh: Effect.succeed(refreshedProvider),
        streamChanges: Stream.empty,
      },
    } as unknown as ProviderInstance;
    const registryLayer = Layer.succeed(ProviderInstanceRegistry, {
      getInstance: (instanceId) =>
        Effect.succeed(instanceId === codexInstanceId ? providerInstance : undefined),
      listInstances: Effect.succeed([providerInstance]),
      listUnavailable: Effect.succeed([]),
      streamChanges: Stream.empty,
      subscribeChanges: Effect.never,
    });
    const spawnerLayer = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make((command) => {
        const input = command as unknown as {
          readonly command: string;
          readonly args: ReadonlyArray<string>;
        };
        commands.push({ command: input.command, args: input.args });
        return Effect.succeed(makeHandle({ stdout: "updated", stderr: "", code: 0 }));
      }),
    );
    const testLayer = ProviderMaintenanceRunnerLive.pipe(
      Layer.provideMerge(Layer.mergeAll(FetchHttpClient.layer, spawnerLayer, registryLayer)),
    );

    return Effect.gen(function* () {
      const runner = yield* ProviderMaintenanceRunner;
      const result = yield* runner.updateProvider({
        provider: codexDriver,
        instanceId: codexInstanceId,
      });

      assert.deepStrictEqual(commands, [
        {
          command: "npm",
          args: ["install", "-g", "@openai/codex@latest"],
        },
      ]);
      const [updatedProvider] = result.providers;
      assert.strictEqual(updatedProvider?.instanceId, codexInstanceId);
      assert.strictEqual(updatedProvider?.updateState?.status, "succeeded");
      assert.strictEqual(updatedProvider?.updateState?.output, "updated");
    }).pipe(Effect.provide(testLayer));
  });
});

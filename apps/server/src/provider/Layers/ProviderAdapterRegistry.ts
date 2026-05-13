import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderKind,
} from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";

import { ProviderUnsupportedError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import { ClaudeAdapter } from "../Services/ClaudeAdapter.ts";
import { CodexAdapter } from "../Services/CodexAdapter.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import {
  ProviderAdapterRegistry,
  type ProviderAdapterRegistryShape,
} from "../Services/ProviderAdapterRegistry.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

export interface ProviderAdapterRegistryLiveOptions {
  readonly adapters?: ReadonlyArray<ProviderAdapterShape<ProviderAdapterError>>;
}

const makeLegacyProviderAdapterRegistry = (options?: ProviderAdapterRegistryLiveOptions) =>
  Effect.gen(function* () {
    const adapters =
      options?.adapters !== undefined
        ? options.adapters
        : [yield* CodexAdapter, yield* ClaudeAdapter];
    const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));

    const getByProvider: ProviderAdapterRegistryShape["getByProvider"] = (provider) => {
      const adapter = byProvider.get(provider);
      if (!adapter) {
        return Effect.fail(new ProviderUnsupportedError({ provider }));
      }
      return Effect.succeed(adapter);
    };

    const listProviders: ProviderAdapterRegistryShape["listProviders"] = () =>
      Effect.sync(() => Array.from(byProvider.keys()));

    return {
      getByProvider,
      listProviders,
    } satisfies ProviderAdapterRegistryShape;
  });

const makeProviderAdapterRegistry = Effect.fn("makeProviderAdapterRegistry")(function* () {
  const registry = yield* ProviderInstanceRegistry;

  const getByInstance: ProviderAdapterRegistryShape["getByInstance"] = (instanceId) =>
    registry.getInstance(instanceId).pipe(
      Effect.flatMap((instance) =>
        instance === undefined
          ? Effect.fail(
              new ProviderUnsupportedError({
                provider: instanceId,
              }),
            )
          : Effect.succeed(instance.adapter),
      ),
    );

  const getInstanceInfo: ProviderAdapterRegistryShape["getInstanceInfo"] = (instanceId) =>
    registry.getInstance(instanceId).pipe(
      Effect.flatMap((instance) =>
        instance === undefined
          ? Effect.fail(
              new ProviderUnsupportedError({
                provider: instanceId,
              }),
            )
          : Effect.succeed({
              instanceId: instance.instanceId,
              driverKind: instance.driverKind,
              displayName: instance.displayName,
              accentColor: instance.accentColor,
              enabled: instance.enabled,
              continuationIdentity: instance.continuationIdentity,
            }),
      ),
    );

  const listInstances: ProviderAdapterRegistryShape["listInstances"] = () =>
    registry.listInstances.pipe(
      Effect.map((instances) => instances.map((instance) => instance.instanceId)),
    );

  const getByProvider: ProviderAdapterRegistryShape["getByProvider"] = (provider) =>
    getByInstance(defaultInstanceIdForDriver(decodeProviderDriverKind(provider)));

  const listProviders: ProviderAdapterRegistryShape["listProviders"] = () =>
    registry.listInstances.pipe(
      Effect.map((instances) => {
        const kinds = new Set<ProviderDriverKind>();
        for (const instance of instances) {
          const defaultId = defaultInstanceIdForDriver(instance.driverKind);
          if (instance.instanceId === defaultId) {
            kinds.add(instance.driverKind);
          }
        }
        return Array.from(kinds) as unknown as ReadonlyArray<ProviderKind>;
      }),
    );

  return {
    getByInstance,
    getInstanceInfo,
    listInstances,
    getByProvider,
    listProviders,
    streamChanges: registry.streamChanges,
    subscribeChanges: registry.subscribeChanges,
  } satisfies ProviderAdapterRegistryShape;
});

export const ProviderAdapterRegistryFromInstanceRegistryLive = Layer.effect(
  ProviderAdapterRegistry,
  makeProviderAdapterRegistry(),
);

export const ProviderAdapterRegistryLive = Layer.effect(
  ProviderAdapterRegistry,
  makeLegacyProviderAdapterRegistry(),
);

export { makeProviderAdapterRegistry, ProviderAdapterRegistry, decodeProviderInstanceId };

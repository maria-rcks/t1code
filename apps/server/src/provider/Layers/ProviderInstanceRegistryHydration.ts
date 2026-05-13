import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceConfigMap,
  type ServerSettings,
} from "@t3tools/contracts";
import { Effect, Layer, Schema, Stream } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { BUILT_IN_DRIVERS, type BuiltInDriversEnv } from "../builtInDrivers.ts";
import { ProviderInstanceRegistry } from "../Services/ProviderInstanceRegistry.ts";
import { ProviderInstanceRegistryMutator } from "../Services/ProviderInstanceRegistryMutator.ts";
import { ProviderInstanceRegistryMutableLayer } from "./ProviderInstanceRegistryLive.ts";

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const LEGACY_SETTINGS_DRIVER_KEYS = ["codex", "claudeAgent", "cursor", "opencode"] as const;
const LEGACY_SETTINGS_DRIVERS = LEGACY_SETTINGS_DRIVER_KEYS.map((driver) =>
  decodeProviderDriverKind(driver),
);

export const deriveProviderInstanceConfigMap = (
  settings: ServerSettings,
): ProviderInstanceConfigMap => {
  const merged: Record<string, ProviderInstanceConfig> = { ...settings.providerInstances };

  for (const driverKind of LEGACY_SETTINGS_DRIVERS) {
    const instanceId = defaultInstanceIdForDriver(driverKind);
    if (instanceId in merged) {
      continue;
    }

    const legacyKey = driverKind as keyof ServerSettings["providers"];
    const legacyConfig = settings.providers[legacyKey];
    if (legacyConfig === undefined) {
      continue;
    }

    merged[instanceId] = {
      driver: driverKind,
      config: legacyConfig,
    };
  }

  return merged as ProviderInstanceConfigMap;
};

const SettingsWatcherLive: Layer.Layer<
  never,
  never,
  ProviderInstanceRegistryMutator | ServerSettingsService
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const mutator = yield* ProviderInstanceRegistryMutator;
    const serverSettings = yield* ServerSettingsService;
    yield* serverSettings.streamChanges.pipe(
      Stream.runForEach((next) =>
        mutator
          .reconcile(deriveProviderInstanceConfigMap(next))
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logError("ProviderInstanceRegistry reconcile failed", cause),
            ),
          ),
      ),
      Effect.forkScoped,
    );
  }),
);

export const ProviderInstanceRegistryHydrationLive: Layer.Layer<
  ProviderInstanceRegistry,
  never,
  BuiltInDriversEnv | ServerSettingsService
> = Layer.unwrap(
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const initialSettings: ServerSettings | undefined = yield* serverSettings.getSettings.pipe(
      Effect.orElseSucceed(() => undefined),
    );
    const initialConfigMap =
      initialSettings === undefined
        ? ({} as ProviderInstanceConfigMap)
        : deriveProviderInstanceConfigMap(initialSettings);

    const mutableLayer = ProviderInstanceRegistryMutableLayer({
      drivers: BUILT_IN_DRIVERS,
      configMap: initialConfigMap,
    });

    return SettingsWatcherLive.pipe(Layer.provideMerge(mutableLayer));
  }),
) as Layer.Layer<ProviderInstanceRegistry, never, BuiltInDriversEnv | ServerSettingsService>;

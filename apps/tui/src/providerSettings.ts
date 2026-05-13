import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  defaultInstanceIdForDriver,
  type ProviderInstanceConfig,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import { Schema } from "effect";

export type ProviderSettingsKey = keyof ServerSettings["providers"];
type DefaultProviderInstancePatch = {
  readonly accentColor?: ProviderInstanceConfig["accentColor"] | undefined;
  readonly displayName?: ProviderInstanceConfig["displayName"] | undefined;
  readonly enabled?: ProviderInstanceConfig["enabled"] | undefined;
  readonly environment?: ProviderInstanceConfig["environment"] | undefined;
};
type ProviderInstancePatch = DefaultProviderInstancePatch;

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

export function providerDriverKindForSettingsKey(
  provider: ProviderSettingsKey,
): ProviderDriverKind {
  return decodeProviderDriverKind(provider);
}

export function defaultProviderInstanceIdForSettingsKey(
  provider: ProviderSettingsKey,
): ProviderInstanceId {
  return defaultInstanceIdForDriver(providerDriverKindForSettingsKey(provider));
}

function recordConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !globalThis.Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function definedProviderInstancePatch(
  patch: ProviderInstancePatch | undefined,
): Partial<
  Pick<ProviderInstanceConfig, "accentColor" | "displayName" | "enabled" | "environment">
> {
  return Object.fromEntries(
    Object.entries(patch ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<
    Pick<ProviderInstanceConfig, "accentColor" | "displayName" | "enabled" | "environment">
  >;
}

function clearEmptyProviderInstanceFields(
  instance: ProviderInstanceConfig,
  patch: ProviderInstancePatch | undefined,
): ProviderInstanceConfig {
  let nextInstance = instance;
  if (patch && "displayName" in patch && !patch.displayName) {
    const { displayName: _displayName, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }
  if (patch && "accentColor" in patch && !patch.accentColor) {
    const { accentColor: _accentColor, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }
  if (patch && "environment" in patch && !patch.environment) {
    const { environment: _environment, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }
  return nextInstance;
}

export function buildDefaultProviderInstanceUpdatePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances" | "providers">;
  readonly provider: ProviderSettingsKey;
  readonly configPatch: Readonly<Record<string, unknown>>;
  readonly instancePatch?: DefaultProviderInstancePatch | undefined;
}): ServerSettingsPatch {
  const driver = providerDriverKindForSettingsKey(input.provider);
  const instanceId = defaultInstanceIdForDriver(driver);
  const existing = input.settings.providerInstances[instanceId];
  const legacyConfig = input.settings.providers[input.provider];
  const defaultLegacyConfig = DEFAULT_SERVER_SETTINGS.providers[input.provider];
  const nextInstance = clearEmptyProviderInstanceFields(
    {
      ...existing,
      driver,
      ...definedProviderInstancePatch(input.instancePatch),
      config: {
        ...legacyConfig,
        ...recordConfig(existing?.config),
        ...input.configPatch,
      },
    },
    input.instancePatch,
  );

  return {
    providers: {
      [input.provider]: defaultLegacyConfig,
    } as NonNullable<ServerSettingsPatch["providers"]>,
    providerInstances: {
      ...input.settings.providerInstances,
      [instanceId]: nextInstance,
    },
  };
}

export function buildResetDefaultProviderInstancesPatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances">;
  readonly providers: ReadonlyArray<ProviderSettingsKey>;
}): ServerSettingsPatch {
  const providerInstances = { ...input.settings.providerInstances };
  for (const provider of input.providers) {
    delete providerInstances[defaultProviderInstanceIdForSettingsKey(provider)];
  }
  const providers = Object.fromEntries(
    input.providers.map((provider) => [provider, DEFAULT_SERVER_SETTINGS.providers[provider]]),
  ) as NonNullable<ServerSettingsPatch["providers"]>;
  return { providers, providerInstances };
}

function nextProviderInstanceId(
  providerInstances: Pick<ServerSettings, "providerInstances">["providerInstances"],
  provider: ProviderSettingsKey,
): ProviderInstanceId {
  const prefix = `${provider}_`;
  for (let index = 2; index < 1_000; index += 1) {
    const candidate = decodeProviderInstanceId(`${prefix}${index}`);
    if (!(candidate in providerInstances)) {
      return candidate;
    }
  }
  throw new Error(`Could not allocate a provider instance id for ${provider}.`);
}

export function buildDuplicateDefaultProviderInstancePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances" | "providers">;
  readonly provider: ProviderSettingsKey;
  readonly title: string;
}): {
  readonly instanceId: ProviderInstanceId;
  readonly patch: ServerSettingsPatch;
} {
  const driver = providerDriverKindForSettingsKey(input.provider);
  const instanceId = nextProviderInstanceId(input.settings.providerInstances, input.provider);
  const defaultInstance = input.settings.providerInstances[defaultInstanceIdForDriver(driver)];
  const config = {
    ...DEFAULT_SERVER_SETTINGS.providers[input.provider],
    ...input.settings.providers[input.provider],
    ...recordConfig(defaultInstance?.config),
  };

  return {
    instanceId,
    patch: {
      providerInstances: {
        ...input.settings.providerInstances,
        [instanceId]: {
          driver,
          enabled: true,
          displayName: `${input.title} ${String(instanceId).replace(`${input.provider}_`, "")}`,
          config,
        },
      },
    },
  };
}

export function buildDeleteProviderInstancePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances">;
  readonly instanceId: ProviderInstanceId;
}): ServerSettingsPatch {
  const providerInstances = { ...input.settings.providerInstances };
  delete providerInstances[input.instanceId];
  return { providerInstances };
}

export function buildProviderInstanceUpdatePatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances">;
  readonly instanceId: ProviderInstanceId;
  readonly configPatch?: Readonly<Record<string, unknown>> | undefined;
  readonly instancePatch?: ProviderInstancePatch | undefined;
}): ServerSettingsPatch {
  const existing = input.settings.providerInstances[input.instanceId];
  if (!existing) {
    throw new Error(`Provider instance ${String(input.instanceId)} does not exist.`);
  }
  const nextInstance = clearEmptyProviderInstanceFields(
    {
      ...existing,
      ...definedProviderInstancePatch(input.instancePatch),
      config: {
        ...recordConfig(existing.config),
        ...input.configPatch,
      },
    },
    input.instancePatch,
  );

  return {
    providerInstances: {
      ...input.settings.providerInstances,
      [input.instanceId]: nextInstance,
    },
  };
}

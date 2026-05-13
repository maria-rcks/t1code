import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  defaultInstanceIdForDriver,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
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

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);

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
  const definedInstancePatch = Object.fromEntries(
    Object.entries(input.instancePatch ?? {}).filter(([, value]) => value !== undefined),
  ) as Partial<
    Pick<ProviderInstanceConfig, "accentColor" | "displayName" | "enabled" | "environment">
  >;
  let nextInstance: ProviderInstanceConfig = {
    ...existing,
    driver,
    ...definedInstancePatch,
    config: {
      ...legacyConfig,
      ...recordConfig(existing?.config),
      ...input.configPatch,
    },
  };
  if (
    input.instancePatch &&
    "displayName" in input.instancePatch &&
    !input.instancePatch.displayName
  ) {
    const { displayName: _displayName, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }
  if (
    input.instancePatch &&
    "accentColor" in input.instancePatch &&
    !input.instancePatch.accentColor
  ) {
    const { accentColor: _accentColor, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }
  if (
    input.instancePatch &&
    "environment" in input.instancePatch &&
    !input.instancePatch.environment
  ) {
    const { environment: _environment, ...rest } = nextInstance;
    nextInstance = rest as ProviderInstanceConfig;
  }

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

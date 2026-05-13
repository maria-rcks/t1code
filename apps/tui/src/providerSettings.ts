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
}): ServerSettingsPatch {
  const driver = providerDriverKindForSettingsKey(input.provider);
  const instanceId = defaultInstanceIdForDriver(driver);
  const existing = input.settings.providerInstances[instanceId];
  const legacyConfig = input.settings.providers[input.provider];
  const defaultLegacyConfig = DEFAULT_SERVER_SETTINGS.providers[input.provider];
  const nextInstance: ProviderInstanceConfig = {
    ...existing,
    driver,
    config: {
      ...legacyConfig,
      ...recordConfig(existing?.config),
      ...input.configPatch,
    },
  };

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

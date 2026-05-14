import {
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  DEFAULT_SERVER_SETTINGS,
  OpenCodeSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  defaultInstanceIdForDriver,
  type ProviderSettingsFormAnnotation,
  type ProviderInstanceConfig,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import { Schema } from "effect";

export type ProviderSettingsKey = keyof ServerSettings["providers"];
type ProviderSettingsSchemaAnnotations = {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly providerSettingsForm?: ProviderSettingsFormAnnotation | undefined;
  readonly providerSettingsFormSchema?:
    | {
        readonly order?: readonly string[] | undefined;
      }
    | undefined;
};
type AnnotatedProviderSchema = {
  readonly ast: {
    readonly context?:
      | {
          readonly annotations?: ProviderSettingsSchemaAnnotations | undefined;
        }
      | undefined;
    readonly annotations?: ProviderSettingsSchemaAnnotations | undefined;
  };
};
type ProviderSettingsSchema = {
  readonly fields: Readonly<Record<string, AnnotatedProviderSchema>>;
} & AnnotatedProviderSchema;
type ProviderSettingsDefinition = {
  readonly provider: ProviderSettingsKey;
  readonly title: string;
  readonly schema: ProviderSettingsSchema;
};
export type InstallProviderFieldKey = string;
export type InstallProviderField = {
  readonly key: InstallProviderFieldKey;
  readonly label: string;
  readonly placeholder: string;
  readonly description: string;
};
export type InstallProviderSettings = {
  readonly provider: ProviderSettingsKey;
  readonly title: string;
  readonly fields: readonly InstallProviderField[];
};
export type ComingSoonInstallProviderOption = {
  readonly provider: ProviderDriverKind;
  readonly title: string;
};
type DefaultProviderInstancePatch = {
  readonly accentColor?: ProviderInstanceConfig["accentColor"] | undefined;
  readonly displayName?: ProviderInstanceConfig["displayName"] | undefined;
  readonly enabled?: ProviderInstanceConfig["enabled"] | undefined;
  readonly environment?: ProviderInstanceConfig["environment"] | undefined;
};
type ProviderInstancePatch = DefaultProviderInstancePatch;

const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

const PROVIDER_SETTINGS_DEFINITIONS: readonly ProviderSettingsDefinition[] = [
  {
    provider: "codex",
    title: "Codex",
    schema: CodexSettings,
  },
  {
    provider: "claudeAgent",
    title: "Claude",
    schema: ClaudeSettings,
  },
  {
    provider: "cursor",
    title: "Cursor",
    schema: CursorSettings,
  },
  {
    provider: "opencode",
    title: "OpenCode",
    schema: OpenCodeSettings,
  },
] as const;

function titleizeFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function readFieldAnnotations(fieldSchema: AnnotatedProviderSchema) {
  return fieldSchema.ast.context?.annotations ?? fieldSchema.ast.annotations;
}

function readFieldAnnotationString(
  fieldSchema: AnnotatedProviderSchema,
  key: "title" | "description",
): string | undefined {
  const annotations = readFieldAnnotations(fieldSchema);
  const value = annotations?.[key];
  return typeof value === "string" ? value : undefined;
}

function readProviderSettingsFormAnnotation(
  fieldSchema: AnnotatedProviderSchema,
): ProviderSettingsFormAnnotation {
  return readFieldAnnotations(fieldSchema)?.providerSettingsForm ?? {};
}

function readProviderSettingsFieldOrder(schema: ProviderSettingsSchema): readonly string[] {
  return schema.ast.context?.annotations?.providerSettingsFormSchema?.order ?? [];
}

function deriveInstallProviderFields(
  schema: ProviderSettingsSchema,
): readonly InstallProviderField[] {
  const orderedKeys = new Map(
    readProviderSettingsFieldOrder(schema).map((key, index) => [key, index] as const),
  );
  const orderFallbackOffset = orderedKeys.size;

  return Object.keys(schema.fields)
    .map((key, index) => ({ key, index }))
    .toSorted(
      (left, right) =>
        (orderedKeys.get(left.key) ?? orderFallbackOffset + left.index) -
        (orderedKeys.get(right.key) ?? orderFallbackOffset + right.index),
    )
    .flatMap(({ key }) => {
      const fieldSchema = schema.fields[key]!;
      const formAnnotation = readProviderSettingsFormAnnotation(fieldSchema);
      if (formAnnotation.hidden) return [];
      return [
        {
          key,
          label: readFieldAnnotationString(fieldSchema, "title") ?? titleizeFieldKey(key),
          placeholder: formAnnotation.placeholder ?? "",
          description: readFieldAnnotationString(fieldSchema, "description") ?? "",
        },
      ];
    });
}

export const INSTALL_PROVIDER_SETTINGS: readonly InstallProviderSettings[] =
  PROVIDER_SETTINGS_DEFINITIONS.map((definition) => ({
    provider: definition.provider,
    title: definition.title,
    fields: deriveInstallProviderFields(definition.schema),
  }));

export const COMING_SOON_INSTALL_PROVIDER_OPTIONS: readonly ComingSoonInstallProviderOption[] = [
  {
    provider: decodeProviderDriverKind("githubCopilot"),
    title: "GitHub Copilot",
  },
  {
    provider: decodeProviderDriverKind("gemini"),
    title: "Gemini",
  },
  {
    provider: decodeProviderDriverKind("acpRegistry"),
    title: "ACP Registry",
  },
  {
    provider: decodeProviderDriverKind("piAgent"),
    title: "Pi Agent",
  },
];

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

export function buildResetProviderCustomModelsPatch(input: {
  readonly settings: Pick<ServerSettings, "providerInstances" | "providers">;
  readonly providers: ReadonlyArray<ProviderSettingsKey>;
}): ServerSettingsPatch {
  const currentProviders: ServerSettings["providers"] = { ...input.settings.providers };
  let providerInstances = input.settings.providerInstances;
  const providers: NonNullable<ServerSettingsPatch["providers"]> = {};

  for (const provider of input.providers) {
    const defaultConfig = DEFAULT_SERVER_SETTINGS.providers[provider];
    if (!("customModels" in defaultConfig)) {
      continue;
    }
    const settingsPatch = buildDefaultProviderInstanceUpdatePatch({
      settings: {
        providers: currentProviders,
        providerInstances,
      },
      provider,
      configPatch: { customModels: defaultConfig.customModels },
    });
    const providerPatch = settingsPatch.providers as NonNullable<ServerSettingsPatch["providers"]>;
    Object.assign(providers, providerPatch);
    Object.assign(currentProviders, providerPatch);
    providerInstances = settingsPatch.providerInstances ?? providerInstances;
  }

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

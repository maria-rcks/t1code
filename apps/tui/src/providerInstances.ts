import {
  defaultInstanceIdForDriver,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerProviderModel,
  type ServerProviderState,
} from "@t3tools/contracts";

export interface ProviderInstanceEntry {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly accentColor?: string;
  readonly continuationGroupKey?: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly status: ServerProviderState;
  readonly isDefault: boolean;
  readonly isAvailable: boolean;
  readonly snapshot: ServerProvider;
  readonly models: ReadonlyArray<ServerProviderModel>;
}

export interface ProviderInstanceModelOption {
  readonly slug: string;
  readonly name: string;
  readonly isCustom: boolean;
}

function formatProviderDriverKindLabel(driverKind: ProviderDriverKind): string {
  return driverKind
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function humanizeInstanceId(instanceId: ProviderInstanceId): string {
  return formatProviderDriverKindLabel(instanceId as string as ProviderDriverKind);
}

function driverKindLabel(driverKind: ProviderDriverKind): string {
  if (driverKind === "codex") return "Codex";
  if (driverKind === "claudeAgent") return "Claude";
  return formatProviderDriverKindLabel(driverKind);
}

export function normalizeProviderAccentColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^#[0-9a-fA-F]{6}$/u.test(trimmed) ? trimmed : undefined;
}

function resolveInstanceDisplayName(
  snapshot: ServerProvider,
  instanceId: ProviderInstanceId,
  driverKind: ProviderDriverKind,
  isDefault: boolean,
): string {
  const trimmedSnapshotName = snapshot.displayName?.trim();
  const kindLabel = driverKindLabel(driverKind);
  if (trimmedSnapshotName && trimmedSnapshotName !== kindLabel) {
    return trimmedSnapshotName;
  }
  if (!isDefault) {
    const humanized = humanizeInstanceId(instanceId);
    if (humanized.length > 0) return humanized;
  }
  return trimmedSnapshotName || kindLabel;
}

export function deriveProviderInstanceEntries(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ProviderInstanceEntry> {
  return providers.map((snapshot) => {
    const instanceId = snapshot.instanceId;
    const driverKind = snapshot.driver;
    const defaultId = defaultInstanceIdForDriver(driverKind);
    const isDefault = instanceId === defaultId;
    const displayName = resolveInstanceDisplayName(snapshot, instanceId, driverKind, isDefault);
    const accentColor = normalizeProviderAccentColor(snapshot.accentColor);
    return {
      instanceId,
      driverKind,
      displayName,
      ...(accentColor ? { accentColor } : {}),
      ...(snapshot.continuation?.groupKey
        ? { continuationGroupKey: snapshot.continuation.groupKey }
        : {}),
      enabled: snapshot.enabled,
      installed: snapshot.installed,
      status: snapshot.status,
      isDefault,
      isAvailable: snapshot.availability !== "unavailable",
      snapshot,
      models: snapshot.models,
    };
  });
}

export function sortProviderInstanceEntries(
  entries: ReadonlyArray<ProviderInstanceEntry>,
): ReadonlyArray<ProviderInstanceEntry> {
  const byKind = new Map<ProviderDriverKind, ProviderInstanceEntry[]>();
  for (const entry of entries) {
    const bucket = byKind.get(entry.driverKind);
    if (bucket) {
      bucket.push(entry);
    } else {
      byKind.set(entry.driverKind, [entry]);
    }
  }

  const sorted: ProviderInstanceEntry[] = [];
  for (const bucket of byKind.values()) {
    sorted.push(
      ...bucket.filter((entry) => entry.isDefault),
      ...bucket.filter((entry) => !entry.isDefault),
    );
  }
  return sorted;
}

export function getProviderInstanceEntry(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ProviderInstanceEntry | undefined {
  return deriveProviderInstanceEntries(providers).find((entry) => entry.instanceId === instanceId);
}

export function getProviderInstanceModels(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ReadonlyArray<ServerProviderModel> {
  return getProviderInstanceEntry(providers, instanceId)?.models ?? [];
}

export function getProviderInstanceModelOptions(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
  fallbackOptions: ReadonlyArray<ProviderInstanceModelOption>,
): ReadonlyArray<ProviderInstanceModelOption> {
  const instanceModels = getProviderInstanceModels(providers, instanceId);
  if (instanceModels.length === 0) return fallbackOptions;

  const options: ProviderInstanceModelOption[] = instanceModels.map((model) => ({
    slug: model.slug,
    name: model.name,
    isCustom: model.isCustom,
  }));
  const seen = new Set(options.map((option) => option.slug));
  for (const option of fallbackOptions) {
    if (!option.isCustom || seen.has(option.slug)) {
      continue;
    }
    seen.add(option.slug);
    options.push(option);
  }
  return options;
}

export function resolveSelectableProviderInstance(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId | undefined,
): ProviderInstanceId | undefined {
  const entries = deriveProviderInstanceEntries(providers);
  if (instanceId !== undefined) {
    const selected = entries.find(
      (entry) => entry.instanceId === instanceId && entry.enabled && entry.isAvailable,
    );
    if (selected) return selected.instanceId;
  }
  return entries.find((entry) => entry.enabled && entry.isAvailable)?.instanceId;
}

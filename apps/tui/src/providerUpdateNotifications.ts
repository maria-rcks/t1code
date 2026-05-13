import {
  defaultInstanceIdForDriver,
  type ProviderDriverKind,
  type ServerProvider,
} from "@t3tools/contracts";

type ProviderUpdateTone = "loading" | "warning" | "error" | "success";

export type ProviderUpdateNoticeKind =
  | "available"
  | "active"
  | "failed"
  | "unchanged"
  | "succeeded";

export interface ProviderUpdateNoticeView {
  readonly key: string;
  readonly kind: ProviderUpdateNoticeKind;
  readonly tone: ProviderUpdateTone;
  readonly title: string;
  readonly description: string;
  readonly dismissible: boolean;
  readonly dismissAfterVisibleMs?: number;
}

interface ProviderUpdateNoticeOptions {
  readonly visibleAfterIso?: string | undefined;
  readonly dismissedKeys?: ReadonlySet<string> | undefined;
}

export type ProviderUpdateCandidate = ServerProvider & {
  readonly versionAdvisory: NonNullable<ServerProvider["versionAdvisory"]> & {
    readonly status: "behind_latest";
    readonly latestVersion: string;
  };
};

const PROVIDER_UPDATE_SUCCESS_VISIBLE_MS = 3_000;

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
  githubCopilot: "GitHub Copilot",
  gemini: "Gemini",
  acpRegistry: "ACP Registry",
  piAgent: "Pi Agent",
};

function providerName(provider: Pick<ServerProvider, "driver">): string {
  return PROVIDER_NAMES[provider.driver] ?? provider.driver;
}

function formatVersion(value: string): string {
  return value.startsWith("v") ? value : `v${value}`;
}

function chooseRepresentativeProvider(
  current: ServerProvider | undefined,
  candidate: ServerProvider,
): ServerProvider {
  if (!current) return candidate;
  const defaultInstanceId = defaultInstanceIdForDriver(candidate.driver);
  if (candidate.instanceId === defaultInstanceId) return candidate;
  if (current.instanceId === defaultInstanceId) return current;
  return candidate.checkedAt.localeCompare(current.checkedAt) >= 0 ? candidate : current;
}

function dedupeProvidersByDriver<T extends ServerProvider>(providers: ReadonlyArray<T>): T[] {
  const latestProviderByDriver = new Map<ProviderDriverKind, T>();

  for (const provider of providers) {
    latestProviderByDriver.set(
      provider.driver,
      chooseRepresentativeProvider(latestProviderByDriver.get(provider.driver), provider) as T,
    );
  }

  return [...latestProviderByDriver.values()];
}

function formatProviderList(providers: ReadonlyArray<Pick<ServerProvider, "driver">>): string {
  const names = providers.map(providerName);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function isProviderUpdateCandidate(
  provider: ServerProvider,
): provider is ProviderUpdateCandidate {
  return (
    provider.enabled &&
    provider.versionAdvisory?.status === "behind_latest" &&
    provider.versionAdvisory.latestVersion !== null
  );
}

export function isProviderUpdateActive(provider: Pick<ServerProvider, "updateState">): boolean {
  return provider.updateState?.status === "queued" || provider.updateState?.status === "running";
}

export function collectProviderUpdateCandidates(
  providers: ReadonlyArray<ServerProvider>,
): ProviderUpdateCandidate[] {
  return dedupeProvidersByDriver(providers.filter(isProviderUpdateCandidate));
}

export function providerUpdateNotificationKey(
  providers: ReadonlyArray<ProviderUpdateCandidate>,
): string | null {
  const parts = dedupeProvidersByDriver(providers)
    .map((provider) => [provider.driver, provider.versionAdvisory.latestVersion].join(":"))
    .toSorted();

  return parts.length > 0 ? parts.join("|") : null;
}

function latestFinishedAtForProviders(providers: ReadonlyArray<ServerProvider>): string | null {
  let latest: string | null = null;
  for (const provider of providers) {
    const finishedAt = provider.updateState?.finishedAt ?? null;
    if (finishedAt && (!latest || finishedAt.localeCompare(latest) > 0)) {
      latest = finishedAt;
    }
  }
  return latest;
}

function isRecentTerminalProvider(
  provider: ServerProvider,
  visibleAfterIso: string | undefined,
): boolean {
  const status = provider.updateState?.status;
  if (status !== "failed" && status !== "unchanged" && status !== "succeeded") {
    return false;
  }
  const finishedAt = provider.updateState?.finishedAt;
  if (!visibleAfterIso || !finishedAt) return true;
  return finishedAt >= visibleAfterIso;
}

function failedDescription(providers: ReadonlyArray<ServerProvider>): string {
  if (providers.length === 1 && providers[0]?.updateState?.message) {
    return providers[0].updateState.message;
  }
  return `${formatProviderList(providers)} failed to update. Check provider settings for details.`;
}

function updatedTitle(provider: Pick<ServerProvider, "driver" | "version">): string {
  return provider.version
    ? `${providerName(provider)} updated: ${formatVersion(provider.version)}`
    : `${providerName(provider)} updated`;
}

export function getProviderUpdateNoticeView(
  providers: ReadonlyArray<ServerProvider>,
  options: ProviderUpdateNoticeOptions = {},
): ProviderUpdateNoticeView | null {
  const dedupedProviders = dedupeProvidersByDriver(providers);
  const activeProviders = dedupedProviders.filter(isProviderUpdateActive);
  if (activeProviders.length > 0) {
    const activeProvider = activeProviders[0]!;
    return {
      key: `loading:${activeProviders
        .map((provider) => `${provider.driver}:${provider.updateState?.status ?? "idle"}`)
        .toSorted()
        .join("|")}`,
      kind: "active",
      tone: "loading",
      title:
        activeProviders.length === 1
          ? `Updating ${providerName(activeProvider)}`
          : `Updating ${activeProviders.length} providers`,
      description:
        activeProviders.length === 1
          ? `${formatProviderList(activeProviders)} update in progress.`
          : `${formatProviderList(activeProviders)} updates are in progress.`,
      dismissible: false,
    };
  }

  const recentTerminalProviders = dedupedProviders.filter((provider) =>
    isRecentTerminalProvider(provider, options.visibleAfterIso),
  );
  const terminalCandidates: Array<ProviderUpdateNoticeView & { readonly finishedAt: string }> = [];

  const failedProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "failed",
  );
  if (failedProviders.length > 0) {
    const failedProvider = failedProviders[0]!;
    const attemptedVersion = failedProvider.versionAdvisory?.latestVersion;
    terminalCandidates.push({
      key: `failed:${failedProviders
        .map(
          (provider) =>
            `${provider.driver}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      kind: "failed",
      tone: "error",
      title:
        failedProviders.length === 1
          ? attemptedVersion
            ? `${providerName(failedProvider)} ${formatVersion(attemptedVersion)} update failed`
            : `${providerName(failedProvider)} update failed`
          : `${failedProviders.length} provider updates failed`,
      description: failedDescription(failedProviders),
      dismissible: true,
      finishedAt: latestFinishedAtForProviders(failedProviders) ?? "",
    });
  }

  const unchangedProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "unchanged",
  );
  if (unchangedProviders.length > 0) {
    const unchangedProvider = unchangedProviders[0]!;
    terminalCandidates.push({
      key: `unchanged:${unchangedProviders
        .map(
          (provider) =>
            `${provider.driver}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      kind: "unchanged",
      tone: "warning",
      title:
        unchangedProviders.length === 1
          ? `${providerName(unchangedProvider)} still needs an update`
          : `${unchangedProviders.length} providers still need updates`,
      description: `${formatProviderList(unchangedProviders)} ${
        unchangedProviders.length === 1 ? "still appears" : "still appear"
      } outdated. Review provider settings for details.`,
      dismissible: true,
      finishedAt: latestFinishedAtForProviders(unchangedProviders) ?? "",
    });
  }

  const succeededProviders = recentTerminalProviders.filter(
    (provider) => provider.updateState?.status === "succeeded",
  );
  if (succeededProviders.length > 0) {
    const succeededProvider = succeededProviders[0]!;
    terminalCandidates.push({
      key: `succeeded:${succeededProviders
        .map(
          (provider) =>
            `${provider.driver}:${provider.updateState?.finishedAt ?? "pending"}:${provider.updateState?.message ?? ""}`,
        )
        .toSorted()
        .join("|")}`,
      kind: "succeeded",
      tone: "success",
      title:
        succeededProviders.length === 1
          ? updatedTitle(succeededProvider)
          : `${succeededProviders.length} providers updated`,
      description:
        succeededProviders.length === 1
          ? "New sessions will use the updated provider."
          : "New sessions will use the updated providers.",
      dismissible: false,
      dismissAfterVisibleMs: PROVIDER_UPDATE_SUCCESS_VISIBLE_MS,
      finishedAt: latestFinishedAtForProviders(succeededProviders) ?? "",
    });
  }

  const terminalNotice = terminalCandidates
    .toSorted((left, right) => right.finishedAt.localeCompare(left.finishedAt))
    .find((candidate) => !options.dismissedKeys?.has(candidate.key));
  if (terminalNotice) {
    const { finishedAt: _finishedAt, ...view } = terminalNotice;
    return view;
  }

  const updateCandidates = collectProviderUpdateCandidates(dedupedProviders);
  const updateKey = providerUpdateNotificationKey(updateCandidates);
  if (!updateKey || options.dismissedKeys?.has(updateKey)) return null;

  if (updateCandidates.length === 1) {
    const provider = updateCandidates[0]!;
    return {
      key: updateKey,
      kind: "available",
      tone: "warning",
      title: `Update available: ${providerName(provider)} ${formatVersion(provider.versionAdvisory.latestVersion)}`,
      description: "Review provider settings to install the update.",
      dismissible: true,
    };
  }

  return {
    key: updateKey,
    kind: "available",
    tone: "warning",
    title: `Updates available: ${updateCandidates.length} providers`,
    description: `${formatProviderList(updateCandidates)} can be updated from provider settings.`,
    dismissible: true,
  };
}

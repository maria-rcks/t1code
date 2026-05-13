import { describe, expect, it } from "vitest";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";

import {
  collectProviderUpdateCandidates,
  getProviderUpdateNoticeView,
  providerUpdateNotificationKey,
} from "./providerUpdateNotifications";

const codex = ProviderDriverKind.makeUnsafe("codex");
const claude = ProviderDriverKind.makeUnsafe("claudeAgent");

function provider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.makeUnsafe(String(overrides.driver ?? codex)),
    driver: codex,
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

function outdated(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return provider({
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: "npm install -g @openai/codex@latest",
      canUpdate: true,
      checkedAt: "2026-01-01T00:00:00.000Z",
      message: "Update available.",
    },
    ...overrides,
  });
}

describe("provider update notifications", () => {
  it("dedupes update candidates by driver and prefers the default instance", () => {
    const providers = [
      outdated({
        instanceId: ProviderInstanceId.makeUnsafe("codex-custom"),
        checkedAt: "2026-01-02T00:00:00.000Z",
      }),
      outdated({
        instanceId: ProviderInstanceId.makeUnsafe("codex"),
        checkedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    const candidates = collectProviderUpdateCandidates(providers);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.instanceId).toBe("codex");
  });

  it("builds stable dismissal keys from provider and latest version", () => {
    const key = providerUpdateNotificationKey(
      collectProviderUpdateCandidates([
        outdated({ driver: claude, instanceId: ProviderInstanceId.makeUnsafe("claudeAgent") }),
        outdated(),
      ]),
    );

    expect(key).toBe("claudeAgent:1.1.0|codex:1.1.0");
  });

  it("shows an update-available notice when enabled providers are behind", () => {
    const notice = getProviderUpdateNoticeView([outdated()]);

    expect(notice).toMatchObject({
      kind: "available",
      tone: "warning",
      title: "Update available: Codex v1.1.0",
      dismissible: true,
    });
  });

  it("prefers active update state over available update prompts", () => {
    const notice = getProviderUpdateNoticeView([
      outdated({
        updateState: {
          status: "running",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: null,
          message: "Updating provider.",
          output: null,
        },
      }),
    ]);

    expect(notice).toMatchObject({
      kind: "active",
      tone: "loading",
      title: "Updating Codex",
      dismissible: false,
    });
  });

  it("returns the most recent terminal update result and honors dismissed keys", () => {
    const failed = outdated({
      driver: claude,
      instanceId: ProviderInstanceId.makeUnsafe("claudeAgent"),
      updateState: {
        status: "failed",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:02.000Z",
        message: "Command failed.",
        output: null,
      },
    });
    const succeeded = outdated({
      updateState: {
        status: "succeeded",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:03.000Z",
        message: "Provider updated.",
        output: null,
      },
    });

    const successNotice = getProviderUpdateNoticeView([failed, succeeded]);
    expect(successNotice).toMatchObject({
      kind: "succeeded",
      tone: "success",
    });

    const failedNotice = getProviderUpdateNoticeView([failed, succeeded], {
      dismissedKeys: new Set(successNotice ? [successNotice.key] : []),
    });
    expect(failedNotice).toMatchObject({
      kind: "failed",
      tone: "error",
      description: "Command failed.",
    });
  });
});

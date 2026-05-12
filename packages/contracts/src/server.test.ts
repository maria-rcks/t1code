import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { isProviderAvailable, ServerProvider } from "./server";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);

describe("ServerProvider", () => {
  it("defaults capability arrays when decoding provider snapshots", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex",
      driver: "codex",
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
    });

    expect(parsed.slashCommands).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.versionAdvisory).toBeUndefined();
    expect(parsed.updateState).toBeUndefined();
    expect(isProviderAvailable(parsed)).toBe(true);
  });

  it("defaults one-click update support when decoding older advisory snapshots", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex",
      driver: "codex",
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
      versionAdvisory: {
        status: "behind_latest",
        currentVersion: "1.0.0",
        latestVersion: "1.0.1",
        updateCommand: "npm install -g @openai/codex@latest",
        checkedAt: "2026-04-10T00:00:00.000Z",
        message: "Update available.",
      },
    });

    expect(parsed.versionAdvisory?.canUpdate).toBe(false);
  });

  it("decodes continuation group metadata and model capabilities", () => {
    const parsed = decodeServerProvider({
      instanceId: "codex_personal",
      driver: "codex",
      displayName: "Codex Personal",
      continuation: { groupKey: "codex:home:/Users/maria/.codex" },
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
        email: "maria@example.com",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [
        {
          slug: "gpt-5.4",
          name: "GPT-5.4",
          isCustom: false,
          capabilities: {
            optionDescriptors: [
              {
                id: "reasoningEffort",
                label: "Reasoning",
                type: "select",
                options: [{ id: "high", label: "High", isDefault: true }],
                currentValue: "high",
              },
            ],
          },
        },
      ],
    });

    expect(parsed.continuation?.groupKey).toBe("codex:home:/Users/maria/.codex");
    expect(parsed.models[0]?.capabilities?.optionDescriptors?.[0]?.id).toBe("reasoningEffort");
  });

  it("marks unavailable provider shadows as unavailable", () => {
    const parsed = decodeServerProvider({
      instanceId: "ollama_local",
      driver: "ollama",
      displayName: "Ollama",
      enabled: false,
      installed: false,
      version: null,
      status: "disabled",
      auth: {
        status: "unknown",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      availability: "unavailable",
      unavailableReason: "Driver is not available in this build.",
      models: [],
    });

    expect(isProviderAvailable(parsed)).toBe(false);
    expect(parsed.unavailableReason).toBe("Driver is not available in this build.");
  });
});

import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  ProviderEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
} from "./provider";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);
const decodeProviderSendTurnInput = Schema.decodeUnknownSync(ProviderSendTurnInput);
const decodeProviderSession = Schema.decodeUnknownSync(ProviderSession);
const decodeProviderEvent = Schema.decodeUnknownSync(ProviderEvent);

describe("ProviderSessionStartInput", () => {
  it("accepts codex-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "codex",
      cwd: "/tmp/workspace",
      model: "gpt-5.3-codex",
      modelOptions: {
        codex: {
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      runtimeMode: "full-access",
      providerOptions: {
        codex: {
          binaryPath: "/usr/local/bin/codex",
          homePath: "/tmp/.codex",
        },
      },
    });
    expect(parsed.runtimeMode).toBe("full-access");
    expect(parsed.modelOptions?.codex?.reasoningEffort).toBe("high");
    expect(parsed.modelOptions?.codex?.fastMode).toBe(true);
    expect(parsed.providerOptions?.codex?.binaryPath).toBe("/usr/local/bin/codex");
    expect(parsed.providerOptions?.codex?.homePath).toBe("/tmp/.codex");
  });

  it("rejects payloads without runtime mode", () => {
    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "codex",
      }),
    ).toThrow();
  });

  it("accepts claude runtime knobs", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "claudeAgent",
      cwd: "/tmp/workspace",
      model: "claude-sonnet-4-6",
      modelOptions: {
        claudeAgent: {
          thinking: true,
          effort: "max",
          fastMode: true,
        },
      },
      providerOptions: {
        claudeAgent: {
          binaryPath: "/usr/local/bin/claude",
          permissionMode: "plan",
          maxThinkingTokens: 12_000,
        },
      },
      runtimeMode: "full-access",
    });
    expect(parsed.provider).toBe("claudeAgent");
    expect(parsed.modelOptions?.claudeAgent?.thinking).toBe(true);
    expect(parsed.modelOptions?.claudeAgent?.effort).toBe("max");
    expect(parsed.modelOptions?.claudeAgent?.fastMode).toBe(true);
    expect(parsed.providerOptions?.claudeAgent?.binaryPath).toBe("/usr/local/bin/claude");
    expect(parsed.providerOptions?.claudeAgent?.permissionMode).toBe("plan");
    expect(parsed.providerOptions?.claudeAgent?.maxThinkingTokens).toBe(12_000);
    expect(parsed.runtimeMode).toBe("full-access");
  });

  it("accepts driver-kind providers during the instance migration", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "cursor",
      providerInstanceId: "cursor",
      cwd: "/tmp/workspace",
      modelSelection: {
        instanceId: "cursor",
        model: "auto",
      },
      runtimeMode: "full-access",
    });

    expect(parsed.provider).toBe("cursor");
    expect(parsed.providerInstanceId).toBe("cursor");
    expect(parsed.modelSelection?.instanceId).toBe("cursor");
  });

  it("accepts fork-provided driver kinds as branded slugs", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "ollama",
      providerInstanceId: "ollama_local",
      cwd: "/tmp/workspace",
      modelSelection: {
        instanceId: "ollama_local",
        model: "llama3.3",
      },
      runtimeMode: "full-access",
    });

    expect(parsed.provider).toBe("ollama");
    expect(parsed.providerInstanceId).toBe("ollama_local");
    expect(parsed.modelSelection?.instanceId).toBe("ollama_local");
  });
});

describe("ProviderSendTurnInput", () => {
  it("accepts provider-scoped model options", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      model: "gpt-5.3-codex",
      modelOptions: {
        codex: {
          reasoningEffort: "xhigh",
          fastMode: true,
        },
      },
    });

    expect(parsed.model).toBe("gpt-5.3-codex");
    expect(parsed.modelOptions?.codex?.reasoningEffort).toBe("xhigh");
    expect(parsed.modelOptions?.codex?.fastMode).toBe(true);
  });

  it("accepts claude provider effort options including ultrathink", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      model: "claude-sonnet-4-6",
      modelOptions: {
        claudeAgent: {
          effort: "ultrathink",
          fastMode: true,
        },
      },
    });

    expect(parsed.modelOptions?.claudeAgent?.effort).toBe("ultrathink");
    expect(parsed.modelOptions?.claudeAgent?.fastMode).toBe(true);
  });
});

describe("providerInstanceId routing key", () => {
  it("propagates providerInstanceId through ProviderSession decode", () => {
    const session = decodeProviderSession({
      provider: "codex",
      providerInstanceId: "codex_work",
      status: "ready",
      runtimeMode: "full-access",
      threadId: "thread-1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    expect(session.providerInstanceId).toBe("codex_work");
  });

  it("decodes ProviderSession for fork-provided driver kinds", () => {
    const session = decodeProviderSession({
      provider: "ollama",
      providerInstanceId: "ollama_local",
      status: "ready",
      runtimeMode: "full-access",
      threadId: "thread-1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    expect(session.provider).toBe("ollama");
    expect(session.providerInstanceId).toBe("ollama_local");
  });

  it("decodes ProviderEvent carrying open provider drivers and instance routing", () => {
    const event = decodeProviderEvent({
      id: "event-1",
      kind: "notification",
      provider: "opencode",
      providerInstanceId: "opencode",
      threadId: "thread-1",
      createdAt: "2024-01-01T00:00:00Z",
      method: "session.created",
    });

    expect(event.provider).toBe("opencode");
    expect(event.providerInstanceId).toBe("opencode");
  });

  it("rejects providerInstanceId values that fail the slug pattern", () => {
    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "codex",
        providerInstanceId: "1bad",
        runtimeMode: "full-access",
      }),
    ).toThrow();
  });
});

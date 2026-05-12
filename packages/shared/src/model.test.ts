import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_REASONING_EFFORT_BY_PROVIDER,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  ProviderInstanceId,
  type ProviderDriverKind,
  REASONING_EFFORT_OPTIONS_BY_PROVIDER,
} from "@t3tools/contracts";
import { Schema } from "effect";

import {
  applyClaudePromptEffortPrefix,
  createModelCapabilities,
  createModelSelection,
  buildProviderOptionSelectionsFromDescriptors,
  getEffectiveClaudeCodeEffort,
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelSelectionOptionDescriptors,
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
  getModelOptions,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  getReasoningEffortOptions,
  inferProviderForModel,
  isClaudeUltrathinkPrompt,
  normalizeClaudeModelOptions,
  normalizeCodexModelOptions,
  normalizeModelSlug,
  resolveReasoningEffortForProvider,
  resolveSelectableModel,
  resolveModelSlug,
  resolveModelSlugForProvider,
  supportsClaudeAdaptiveReasoning,
  supportsClaudeFastMode,
  supportsClaudeMaxEffort,
  supportsClaudeThinkingToggle,
  supportsClaudeUltrathinkKeyword,
} from "./model";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

describe("normalizeModelSlug", () => {
  it("maps known aliases to canonical slugs", () => {
    expect(normalizeModelSlug("gpt-5-codex")).toBe("gpt-5.4");
    expect(normalizeModelSlug("5.3")).toBe("gpt-5.3-codex");
    expect(normalizeModelSlug("gpt-5.3")).toBe("gpt-5.3-codex");
  });

  it("returns null for empty or missing values", () => {
    expect(normalizeModelSlug("")).toBeNull();
    expect(normalizeModelSlug("   ")).toBeNull();
    expect(normalizeModelSlug(null)).toBeNull();
    expect(normalizeModelSlug(undefined)).toBeNull();
  });

  it("preserves non-aliased model slugs", () => {
    expect(normalizeModelSlug("gpt-5.2")).toBe("gpt-5.2");
    expect(normalizeModelSlug("gpt-5.2-codex")).toBe("gpt-5.2-codex");
  });

  it("preserves model slugs for open provider drivers", () => {
    expect(normalizeModelSlug("openai/gpt-5", "opencode" as ProviderDriverKind)).toBe(
      "openai/gpt-5",
    );
  });

  it("does not leak prototype properties as aliases", () => {
    expect(normalizeModelSlug("toString")).toBe("toString");
    expect(normalizeModelSlug("constructor")).toBe("constructor");
  });

  it("uses provider-specific aliases", () => {
    expect(normalizeModelSlug("sonnet", "claudeAgent")).toBe("claude-sonnet-4-6");
    expect(normalizeModelSlug("opus-4.6", "claudeAgent")).toBe("claude-opus-4-6");
    expect(normalizeModelSlug("claude-haiku-4-5-20251001", "claudeAgent")).toBe("claude-haiku-4-5");
  });
});

describe("createModelCapabilities", () => {
  it("clones option descriptors", () => {
    const descriptor = {
      id: "mode",
      label: "Mode",
      type: "select" as const,
      options: [{ id: "fast", label: "Fast" }],
      promptInjectedValues: ["fast"],
    };

    const capabilities = createModelCapabilities({ optionDescriptors: [descriptor] });

    descriptor.options.push({ id: "slow", label: "Slow" });
    descriptor.promptInjectedValues.push("slow");

    expect(capabilities.optionDescriptors).toEqual([
      {
        id: "mode",
        label: "Mode",
        type: "select",
        options: [{ id: "fast", label: "Fast" }],
        promptInjectedValues: ["fast"],
      },
    ]);
  });
});

describe("createModelSelection", () => {
  it("clones provider option selections", () => {
    const options = [
      { id: "reasoningEffort", value: "high" },
      { id: "fastMode", value: true },
    ] as const;

    const selection = createModelSelection(decodeProviderInstanceId("codex"), "gpt-5.4", options);

    expect(selection).toEqual({
      instanceId: "codex",
      model: "gpt-5.4",
      options: [
        { id: "reasoningEffort", value: "high" },
        { id: "fastMode", value: true },
      ],
    });
    expect(getModelSelectionStringOptionValue(selection, "reasoningEffort")).toBe("high");
    expect(getModelSelectionBooleanOptionValue(selection, "fastMode")).toBe(true);
  });

  it("omits empty option selections", () => {
    expect(createModelSelection(decodeProviderInstanceId("codex"), "gpt-5.4")).toEqual({
      instanceId: "codex",
      model: "gpt-5.4",
    });
  });
});

describe("provider option descriptors", () => {
  const caps = createModelCapabilities({
    optionDescriptors: [
      {
        id: "effort",
        label: "Reasoning",
        type: "select",
        options: [
          { id: "low", label: "Low" },
          { id: "high", label: "High", isDefault: true },
          { id: "ultrathink", label: "Ultrathink" },
        ],
        promptInjectedValues: ["ultrathink"],
      },
      {
        id: "fastMode",
        label: "Fast Mode",
        type: "boolean",
      },
    ],
  });

  it("applies selections onto cloned descriptors", () => {
    const descriptors = getProviderOptionDescriptors({
      caps,
      selections: [
        { id: "effort", value: "low" },
        { id: "fastMode", value: true },
      ],
    });

    expect(descriptors).toMatchObject([
      { id: "effort", currentValue: "low" },
      { id: "fastMode", currentValue: true },
    ]);
    expect(getProviderOptionCurrentValue(descriptors[0])).toBe("low");
    expect(getProviderOptionCurrentLabel(descriptors[0])).toBe("Low");
    expect(getProviderOptionCurrentLabel(descriptors[1])).toBe("On");
  });

  it("resets prompt-injected values to the default option", () => {
    const descriptors = getProviderOptionDescriptors({
      caps,
      selections: [{ id: "effort", value: "ultrathink" }],
    });

    expect(getProviderOptionCurrentValue(descriptors[0])).toBe("high");
  });

  it("builds selections from descriptors and applies them to model selections", () => {
    const descriptors = getProviderOptionDescriptors({
      caps,
      selections: [{ id: "fastMode", value: true }],
    });
    const selections = buildProviderOptionSelectionsFromDescriptors(descriptors);
    const selection = createModelSelection(
      decodeProviderInstanceId("claudeAgent"),
      "claude-opus-4-6",
      selections,
    );

    expect(getModelSelectionOptionDescriptors(selection, caps)).toMatchObject([
      { id: "effort", currentValue: "high" },
      { id: "fastMode", currentValue: true },
    ]);
  });
});

describe("resolveModelSlug", () => {
  it("returns default only when the model is missing", () => {
    expect(resolveModelSlug(undefined)).toBe(DEFAULT_MODEL);
    expect(resolveModelSlug(null)).toBe(DEFAULT_MODEL);
  });

  it("preserves unknown custom models", () => {
    expect(resolveModelSlug("gpt-4.1")).toBe(DEFAULT_MODEL);
    expect(resolveModelSlug("custom/internal-model")).toBe(DEFAULT_MODEL);
  });

  it("resolves only supported model options", () => {
    for (const model of MODEL_OPTIONS) {
      expect(resolveModelSlug(model.slug)).toBe(model.slug);
    }
  });

  it("supports provider-aware resolution", () => {
    expect(resolveModelSlugForProvider("claudeAgent", undefined)).toBe(
      DEFAULT_MODEL_BY_PROVIDER.claudeAgent,
    );
    expect(resolveModelSlugForProvider("claudeAgent", "sonnet")).toBe("claude-sonnet-4-6");
    expect(resolveModelSlugForProvider("claudeAgent", "gpt-5.3-codex")).toBe(
      DEFAULT_MODEL_BY_PROVIDER.claudeAgent,
    );
  });

  it("keeps codex defaults for backward compatibility", () => {
    expect(getDefaultModel()).toBe(DEFAULT_MODEL);
    expect(getModelOptions()).toEqual(MODEL_OPTIONS);
    expect(getModelOptions("claudeAgent")).toEqual(MODEL_OPTIONS_BY_PROVIDER.claudeAgent);
  });
});

describe("resolveSelectableModel", () => {
  it("resolves exact slug matches", () => {
    expect(
      resolveSelectableModel("codex", "gpt-5.3-codex", [
        { slug: "gpt-5.4", name: "GPT-5.4" },
        { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      ]),
    ).toBe("gpt-5.3-codex");
  });

  it("resolves case-insensitive display-name matches", () => {
    expect(
      resolveSelectableModel("codex", "gpt-5.3 codex", [
        { slug: "gpt-5.4", name: "GPT-5.4" },
        { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      ]),
    ).toBe("gpt-5.3-codex");
  });

  it("resolves provider-specific aliases after normalization", () => {
    expect(
      resolveSelectableModel("codex", "gpt-5-codex", [
        { slug: "gpt-5.4", name: "GPT-5.4" },
        { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      ]),
    ).toBe("gpt-5.4");
    expect(
      resolveSelectableModel("claudeAgent", "sonnet", [
        { slug: "claude-opus-4-6", name: "Claude Opus 4.6" },
        { slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      ]),
    ).toBe("claude-sonnet-4-6");
  });

  it("returns null for empty input", () => {
    expect(resolveSelectableModel("codex", "", [{ slug: "gpt-5.4", name: "GPT-5.4" }])).toBeNull();
    expect(
      resolveSelectableModel("codex", "   ", [{ slug: "gpt-5.4", name: "GPT-5.4" }]),
    ).toBeNull();
    expect(
      resolveSelectableModel("codex", null, [{ slug: "gpt-5.4", name: "GPT-5.4" }]),
    ).toBeNull();
  });

  it("returns null for unknown values that are not present in options", () => {
    expect(
      resolveSelectableModel("codex", "gpt-4.1", [{ slug: "gpt-5.4", name: "GPT-5.4" }]),
    ).toBeNull();
  });

  it("does not accept normalized custom-looking slugs unless they exist in options", () => {
    expect(
      resolveSelectableModel("codex", "custom/internal-model", [
        { slug: "gpt-5.4", name: "GPT-5.4" },
      ]),
    ).toBeNull();
  });

  it("respects provider boundaries", () => {
    expect(
      resolveSelectableModel("codex", "sonnet", [{ slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" }]),
    ).toBeNull();
    expect(
      resolveSelectableModel("claudeAgent", "5.3", [
        { slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      ]),
    ).toBeNull();
  });
});

describe("getReasoningEffortOptions", () => {
  it("returns codex reasoning options for codex", () => {
    expect(getReasoningEffortOptions("codex")).toEqual(REASONING_EFFORT_OPTIONS_BY_PROVIDER.codex);
  });

  it("returns claude effort options for Opus 4.6", () => {
    expect(getReasoningEffortOptions("claudeAgent", "claude-opus-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "max",
      "ultrathink",
    ]);
  });

  it("returns claude effort options for Sonnet 4.6", () => {
    expect(getReasoningEffortOptions("claudeAgent", "claude-sonnet-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "ultrathink",
    ]);
  });

  it("returns no claude effort options for Haiku 4.5", () => {
    expect(getReasoningEffortOptions("claudeAgent", "claude-haiku-4-5")).toEqual([]);
  });
});

describe("inferProviderForModel", () => {
  it("detects known provider model slugs", () => {
    expect(inferProviderForModel("gpt-5.3-codex")).toBe("codex");
    expect(inferProviderForModel("claude-sonnet-4-6")).toBe("claudeAgent");
    expect(inferProviderForModel("sonnet")).toBe("claudeAgent");
  });

  it("falls back when the model is unknown", () => {
    expect(inferProviderForModel("custom/internal-model")).toBe("codex");
    expect(inferProviderForModel("custom/internal-model", "claudeAgent")).toBe("claudeAgent");
  });

  it("treats claude-prefixed custom slugs as claude", () => {
    expect(inferProviderForModel("claude-custom-internal")).toBe("claudeAgent");
  });
});

describe("getDefaultReasoningEffort", () => {
  it("returns provider-scoped defaults", () => {
    expect(getDefaultReasoningEffort("codex")).toBe(DEFAULT_REASONING_EFFORT_BY_PROVIDER.codex);
    expect(getDefaultReasoningEffort("claudeAgent")).toBe(
      DEFAULT_REASONING_EFFORT_BY_PROVIDER.claudeAgent,
    );
  });
});

describe("resolveReasoningEffortForProvider", () => {
  it("accepts provider-scoped effort values", () => {
    expect(resolveReasoningEffortForProvider("codex", "xhigh")).toBe("xhigh");
    expect(resolveReasoningEffortForProvider("claudeAgent", "ultrathink")).toBe("ultrathink");
  });

  it("rejects effort values from the wrong provider", () => {
    expect(resolveReasoningEffortForProvider("codex", "max")).toBeNull();
    expect(resolveReasoningEffortForProvider("claudeAgent", "xhigh")).toBeNull();
  });
});

describe("applyClaudePromptEffortPrefix", () => {
  it("prefixes ultrathink prompts exactly once", () => {
    expect(applyClaudePromptEffortPrefix("Investigate this", "ultrathink")).toBe(
      "Ultrathink:\nInvestigate this",
    );
    expect(applyClaudePromptEffortPrefix("Ultrathink:\nInvestigate this", "ultrathink")).toBe(
      "Ultrathink:\nInvestigate this",
    );
  });

  it("leaves non-ultrathink prompts unchanged", () => {
    expect(applyClaudePromptEffortPrefix("Investigate this", "high")).toBe("Investigate this");
  });
});

describe("getEffectiveClaudeCodeEffort", () => {
  it("does not persist ultrathink into Claude runtime configuration", () => {
    expect(getEffectiveClaudeCodeEffort("ultrathink")).toBeNull();
    expect(getEffectiveClaudeCodeEffort("high")).toBe("high");
  });

  it("returns null when no claude effort is selected", () => {
    expect(getEffectiveClaudeCodeEffort(null)).toBeNull();
    expect(getEffectiveClaudeCodeEffort(undefined)).toBeNull();
  });
});

describe("normalizeCodexModelOptions", () => {
  it("drops default-only codex options", () => {
    expect(
      normalizeCodexModelOptions({ reasoningEffort: "high", fastMode: false }),
    ).toBeUndefined();
  });

  it("preserves non-default codex options", () => {
    expect(normalizeCodexModelOptions({ reasoningEffort: "xhigh", fastMode: true })).toEqual({
      reasoningEffort: "xhigh",
      fastMode: true,
    });
  });
});

describe("normalizeClaudeModelOptions", () => {
  it("drops unsupported fast mode and max effort for Sonnet", () => {
    expect(
      normalizeClaudeModelOptions("claude-sonnet-4-6", {
        effort: "max",
        fastMode: true,
      }),
    ).toBeUndefined();
  });

  it("keeps the Haiku thinking toggle and removes unsupported effort", () => {
    expect(
      normalizeClaudeModelOptions("claude-haiku-4-5", {
        thinking: false,
        effort: "high",
      }),
    ).toEqual({
      thinking: false,
    });
  });
});

describe("supportsClaudeAdaptiveReasoning", () => {
  it("only enables adaptive reasoning for Opus 4.6 and Sonnet 4.6", () => {
    expect(supportsClaudeAdaptiveReasoning("claude-opus-4-6")).toBe(true);
    expect(supportsClaudeAdaptiveReasoning("claude-sonnet-4-6")).toBe(true);
    expect(supportsClaudeAdaptiveReasoning("claude-haiku-4-5")).toBe(false);
    expect(supportsClaudeAdaptiveReasoning(undefined)).toBe(false);
  });
});

describe("supportsClaudeMaxEffort", () => {
  it("only enables max effort for Opus 4.6", () => {
    expect(supportsClaudeMaxEffort("claude-opus-4-6")).toBe(true);
    expect(supportsClaudeMaxEffort("claude-sonnet-4-6")).toBe(false);
    expect(supportsClaudeMaxEffort("claude-haiku-4-5")).toBe(false);
    expect(supportsClaudeMaxEffort(undefined)).toBe(false);
  });
});

describe("supportsClaudeFastMode", () => {
  it("only enables Claude fast mode for Opus 4.6", () => {
    expect(supportsClaudeFastMode("claude-opus-4-6")).toBe(true);
    expect(supportsClaudeFastMode("opus")).toBe(true);
    expect(supportsClaudeFastMode("claude-sonnet-4-6")).toBe(false);
    expect(supportsClaudeFastMode("claude-haiku-4-5")).toBe(false);
    expect(supportsClaudeFastMode(undefined)).toBe(false);
  });
});

describe("supportsClaudeUltrathinkKeyword", () => {
  it("only enables ultrathink keyword handling for Opus 4.6 and Sonnet 4.6", () => {
    expect(supportsClaudeUltrathinkKeyword("claude-opus-4-6")).toBe(true);
    expect(supportsClaudeUltrathinkKeyword("claude-sonnet-4-6")).toBe(true);
    expect(supportsClaudeUltrathinkKeyword("claude-haiku-4-5")).toBe(false);
  });
});

describe("supportsClaudeThinkingToggle", () => {
  it("only enables the Claude thinking toggle for Haiku 4.5", () => {
    expect(supportsClaudeThinkingToggle("claude-opus-4-6")).toBe(false);
    expect(supportsClaudeThinkingToggle("claude-sonnet-4-6")).toBe(false);
    expect(supportsClaudeThinkingToggle("claude-haiku-4-5")).toBe(true);
    expect(supportsClaudeThinkingToggle("haiku")).toBe(true);
    expect(supportsClaudeThinkingToggle(undefined)).toBe(false);
  });
});

describe("isClaudeUltrathinkPrompt", () => {
  it("detects ultrathink prompts case-insensitively", () => {
    expect(isClaudeUltrathinkPrompt("Please ultrathink about this")).toBe(true);
    expect(isClaudeUltrathinkPrompt("Ultrathink:\nInvestigate")).toBe(true);
    expect(isClaudeUltrathinkPrompt("Think hard about this")).toBe(false);
    expect(isClaudeUltrathinkPrompt(undefined)).toBe(false);
  });
});

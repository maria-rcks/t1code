import type {
  ProviderKind,
  ProviderModelOptions,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
} from "@t3tools/contracts";
import {
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  isClaudeUltrathinkPrompt,
} from "@t3tools/shared/model";

export function mergeProviderOptionSelections(
  base: ReadonlyArray<ProviderOptionSelection> | null | undefined,
  override: ReadonlyArray<ProviderOptionSelection> | null | undefined,
): ProviderOptionSelection[] | undefined {
  const byId = new Map<string, ProviderOptionSelection>();
  for (const selection of base ?? []) {
    byId.set(selection.id, selection);
  }
  for (const selection of override ?? []) {
    byId.set(selection.id, selection);
  }
  return byId.size > 0 ? [...byId.values()] : undefined;
}

export function setProviderOptionSelection(
  selections: ReadonlyArray<ProviderOptionSelection> | null | undefined,
  nextSelection: ProviderOptionSelection,
): ProviderOptionSelection[] {
  const next = new Map((selections ?? []).map((selection) => [selection.id, selection]));
  next.set(nextSelection.id, nextSelection);
  return [...next.values()];
}

export function filterProviderOptionSelectionsForDescriptors(
  selections: ReadonlyArray<ProviderOptionSelection> | null | undefined,
  descriptors: ReadonlyArray<ProviderOptionDescriptor> | null | undefined,
): ProviderOptionSelection[] | undefined {
  const descriptorIds = new Set((descriptors ?? []).map((descriptor) => descriptor.id));
  const filtered = (selections ?? []).filter((selection) => descriptorIds.has(selection.id));
  return filtered.length > 0 ? filtered : undefined;
}

export function modelOptionsToProviderOptionSelections(
  provider: ProviderKind,
  modelOptions: ProviderModelOptions | null | undefined,
): ProviderOptionSelection[] | undefined {
  const selections: ProviderOptionSelection[] = [];
  if (provider === "codex") {
    const options = modelOptions?.codex;
    if (options?.reasoningEffort) {
      selections.push({ id: "reasoningEffort", value: options.reasoningEffort });
    }
    if (options?.fastMode === true) {
      selections.push({ id: "fastMode", value: true });
    }
  } else {
    const options = modelOptions?.claudeAgent;
    if (options?.thinking !== undefined) {
      selections.push({ id: "thinking", value: options.thinking });
    }
    if (options?.effort) {
      selections.push({ id: "effort", value: options.effort });
    }
    if (options?.fastMode === true) {
      selections.push({ id: "fastMode", value: true });
    }
  }
  return selections.length > 0 ? selections : undefined;
}

function getOptionDefaultValue(descriptor: ProviderOptionDescriptor): string | boolean | undefined {
  if (descriptor.type === "boolean") return false;
  return descriptor.options.find((option) => option.isDefault)?.id;
}

function getSelectOptionLabel(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  value: string,
): string {
  return descriptor.options.find((option) => option.id === value)?.label ?? value;
}

export function selectedContextWindowLabel(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
): string | null {
  const descriptor = descriptors.find(
    (candidate) => candidate.type === "select" && candidate.id === "contextWindow",
  );
  if (!descriptor || descriptor.type !== "select") return null;
  const currentValue = getProviderOptionCurrentValue(descriptor);
  if (typeof currentValue !== "string" || currentValue === getOptionDefaultValue(descriptor)) {
    return null;
  }
  return getProviderOptionCurrentLabel(descriptor) ?? currentValue;
}

export function providerOptionTraitsLabel(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  prompt: string,
): string | null {
  if (descriptors.length === 0) return null;
  const labels: string[] = [];
  const effortDescriptor = descriptors.find(
    (descriptor) => descriptor.type === "select" && descriptor.id === "effort",
  );
  if (effortDescriptor?.type === "select") {
    const promptInjectedEffort =
      (effortDescriptor.promptInjectedValues?.length ?? 0) > 0 && isClaudeUltrathinkPrompt(prompt)
        ? "ultrathink"
        : null;
    const effortValue = promptInjectedEffort ?? getProviderOptionCurrentValue(effortDescriptor);
    if (typeof effortValue === "string") {
      labels.push(getSelectOptionLabel(effortDescriptor, effortValue));
    }
  }

  for (const descriptor of descriptors) {
    if (descriptor.type !== "boolean") continue;
    if (descriptor.id === "fastMode" && descriptor.currentValue === true) {
      labels.push("Fast");
    } else if (descriptor.id === "thinking" && typeof descriptor.currentValue === "boolean") {
      labels.push(`Thinking ${descriptor.currentValue ? "On" : "Off"}`);
    }
  }

  const contextLabel = selectedContextWindowLabel(descriptors);
  if (contextLabel) {
    labels.push(`${contextLabel} ctx`);
  }

  return labels.length > 0 ? labels.join(" · ") : null;
}

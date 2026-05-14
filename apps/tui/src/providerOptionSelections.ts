import type {
  ProviderKind,
  ProviderModelOptions,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
} from "@t3tools/contracts";

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

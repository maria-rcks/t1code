import {
  type ModelSlug,
  type ProviderKind,
  type ProviderModelOptions,
  type ThreadId,
} from "@t3tools/contracts";
import {
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  isClaudeUltrathinkPrompt,
  normalizeClaudeModelOptions,
  normalizeCodexModelOptions,
  resolveReasoningEffortForProvider,
  supportsClaudeUltrathinkKeyword,
} from "@t3tools/shared/model";
import type { ReactNode } from "react";
import { ClaudeTraitsMenuContent, ClaudeTraitsPicker } from "./ClaudeTraitsPicker";
import { CodexTraitsMenuContent, CodexTraitsPicker } from "./CodexTraitsPicker";

export type ComposerProviderStateInput = {
  provider: ProviderKind;
  model: ModelSlug;
  prompt: string;
  modelOptions: ProviderModelOptions | null | undefined;
};

export type ComposerProviderState = {
  provider: ProviderKind;
  promptEffort: string | null;
  modelOptionsForDispatch: ProviderModelOptions | undefined;
  composerFrameClassName?: string;
  composerSurfaceClassName?: string;
  modelPickerIconClassName?: string;
};

type ProviderRegistryEntry = {
  getState: (input: ComposerProviderStateInput) => ComposerProviderState;
  renderTraitsMenuContent: (input: {
    threadId: ThreadId;
    model: ModelSlug;
    onPromptChange: (prompt: string) => void;
  }) => ReactNode;
  renderTraitsPicker: (input: {
    threadId: ThreadId;
    model: ModelSlug;
    onPromptChange: (prompt: string) => void;
  }) => ReactNode;
};

const composerProviderRegistry: Record<ProviderKind, ProviderRegistryEntry> = {
  codex: {
    getState: ({ modelOptions }) => {
      const promptEffort =
        resolveReasoningEffortForProvider("codex", modelOptions?.codex?.reasoningEffort) ??
        getDefaultReasoningEffort("codex");
      const normalizedCodexOptions = normalizeCodexModelOptions(modelOptions?.codex);

      return {
        provider: "codex",
        promptEffort,
        modelOptionsForDispatch: normalizedCodexOptions
          ? { codex: normalizedCodexOptions }
          : undefined,
      };
    },
    renderTraitsMenuContent: ({ threadId }) => <CodexTraitsMenuContent threadId={threadId} />,
    renderTraitsPicker: ({ threadId }) => <CodexTraitsPicker threadId={threadId} />,
  },
  claudeAgent: {
    getState: ({ model, prompt, modelOptions }) => {
      const reasoningOptions = getReasoningEffortOptions("claudeAgent", model);
      const draftEffort = resolveReasoningEffortForProvider(
        "claudeAgent",
        modelOptions?.claudeAgent?.effort,
      );
      const defaultEffort = getDefaultReasoningEffort("claudeAgent");
      const promptEffort =
        draftEffort && draftEffort !== "ultrathink" && reasoningOptions.includes(draftEffort)
          ? draftEffort
          : reasoningOptions.includes(defaultEffort)
            ? defaultEffort
            : null;
      const normalizedClaudeOptions = normalizeClaudeModelOptions(model, modelOptions?.claudeAgent);
      const ultrathinkActive =
        supportsClaudeUltrathinkKeyword(model) && isClaudeUltrathinkPrompt(prompt);

      return {
        provider: "claudeAgent",
        promptEffort,
        modelOptionsForDispatch: normalizedClaudeOptions
          ? { claudeAgent: normalizedClaudeOptions }
          : undefined,
        ...(ultrathinkActive ? { composerFrameClassName: "ultrathink-frame" } : {}),
        ...(ultrathinkActive
          ? { composerSurfaceClassName: "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]" }
          : {}),
        ...(ultrathinkActive ? { modelPickerIconClassName: "ultrathink-chroma" } : {}),
      };
    },
    renderTraitsMenuContent: ({ threadId, model, onPromptChange }) => (
      <ClaudeTraitsMenuContent threadId={threadId} model={model} onPromptChange={onPromptChange} />
    ),
    renderTraitsPicker: ({ threadId, model, onPromptChange }) => (
      <ClaudeTraitsPicker threadId={threadId} model={model} onPromptChange={onPromptChange} />
    ),
  },
};

export function getComposerProviderState(input: ComposerProviderStateInput): ComposerProviderState {
  return composerProviderRegistry[input.provider].getState(input);
}

export function renderProviderTraitsMenuContent(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  return composerProviderRegistry[input.provider].renderTraitsMenuContent({
    threadId: input.threadId,
    model: input.model,
    onPromptChange: input.onPromptChange,
  });
}

export function renderProviderTraitsPicker(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  return composerProviderRegistry[input.provider].renderTraitsPicker({
    threadId: input.threadId,
    model: input.model,
    onPromptChange: input.onPromptChange,
  });
}

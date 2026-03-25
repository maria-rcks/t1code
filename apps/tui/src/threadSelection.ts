export const DRAFT_THREAD_ID_PREFIX = "draft-thread:";

export function isDraftThreadId(threadId: string | undefined): boolean {
  return typeof threadId === "string" && threadId.startsWith(DRAFT_THREAD_ID_PREFIX);
}

export function shouldClearPendingCreatedThread(input: {
  pendingCreatedThreadId: string | null;
  selectedThreadId: string | undefined;
  threadIds: readonly string[];
}): boolean {
  const { pendingCreatedThreadId, selectedThreadId, threadIds } = input;
  if (!pendingCreatedThreadId) {
    return false;
  }
  if (threadIds.includes(pendingCreatedThreadId)) {
    return true;
  }
  if (!selectedThreadId || selectedThreadId === pendingCreatedThreadId) {
    return false;
  }
  if (isDraftThreadId(selectedThreadId)) {
    return false;
  }
  return true;
}

export function shouldApplyWelcomeBootstrapSelection(input: {
  hasHandledWelcomeBootstrap: boolean;
  currentSelectionId: string | undefined;
}): boolean {
  return !input.hasHandledWelcomeBootstrap && !input.currentSelectionId;
}

export * from "@t3tools/client-core/pendingUserInput";

import type { PendingUserInputDraftAnswer } from "@t3tools/client-core/pendingUserInput";

export function setPendingUserInputCustomAnswer(
  draft: PendingUserInputDraftAnswer | undefined,
  customAnswer: string,
): PendingUserInputDraftAnswer {
  const selectedOptionLabel =
    customAnswer.trim().length > 0 ? undefined : draft?.selectedOptionLabel;

  return {
    customAnswer,
    ...(selectedOptionLabel ? { selectedOptionLabel } : {}),
  };
}

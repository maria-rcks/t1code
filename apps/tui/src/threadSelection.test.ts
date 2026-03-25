import { describe, expect, it } from "vitest";

import {
  DRAFT_THREAD_ID_PREFIX,
  isDraftThreadId,
  shouldApplyWelcomeBootstrapSelection,
  shouldClearPendingCreatedThread,
} from "./threadSelection";

describe("threadSelection", () => {
  it("recognizes draft thread ids", () => {
    expect(isDraftThreadId(`${DRAFT_THREAD_ID_PREFIX}abc`)).toBe(true);
    expect(isDraftThreadId("thread-123")).toBe(false);
    expect(isDraftThreadId(undefined)).toBe(false);
  });

  it("keeps pending-created state while the draft thread is still selected", () => {
    expect(
      shouldClearPendingCreatedThread({
        pendingCreatedThreadId: "thread-new",
        selectedThreadId: `${DRAFT_THREAD_ID_PREFIX}thread-new`,
        threadIds: ["thread-a", "thread-b"],
      }),
    ).toBe(false);
  });

  it("clears pending-created state once the created thread exists", () => {
    expect(
      shouldClearPendingCreatedThread({
        pendingCreatedThreadId: "thread-new",
        selectedThreadId: "thread-new",
        threadIds: ["thread-a", "thread-new"],
      }),
    ).toBe(true);
  });

  it("clears pending-created state after navigating to another real thread", () => {
    expect(
      shouldClearPendingCreatedThread({
        pendingCreatedThreadId: "thread-new",
        selectedThreadId: "thread-a",
        threadIds: ["thread-a", "thread-b"],
      }),
    ).toBe(true);
  });

  it("applies welcome bootstrap only before the tui has its own selection", () => {
    expect(
      shouldApplyWelcomeBootstrapSelection({
        hasHandledWelcomeBootstrap: false,
        currentSelectionId: undefined,
      }),
    ).toBe(true);
    expect(
      shouldApplyWelcomeBootstrapSelection({
        hasHandledWelcomeBootstrap: true,
        currentSelectionId: undefined,
      }),
    ).toBe(false);
    expect(
      shouldApplyWelcomeBootstrapSelection({
        hasHandledWelcomeBootstrap: false,
        currentSelectionId: "thread-a",
      }),
    ).toBe(false);
  });
});

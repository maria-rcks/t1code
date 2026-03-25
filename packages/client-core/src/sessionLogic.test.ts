import { ApprovalRequestId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { derivePendingApprovals, deriveTimelineEntries, hasUnseenCompletion } from "./sessionLogic";

describe("sessionLogic", () => {
  it("detects unseen completion when the latest turn finished after the last visit", () => {
    expect(
      hasUnseenCompletion({
        latestTurn: {
          turnId: "turn-1" as never,
          state: "completed",
          assistantMessageId: null,
          requestedAt: "2026-03-24T10:00:00.000Z",
          startedAt: "2026-03-24T10:00:01.000Z",
          completedAt: "2026-03-24T10:05:00.000Z",
        },
        lastVisitedAt: "2026-03-24T10:04:00.000Z",
      }),
    ).toBe(true);
  });

  it("derives open approvals from thread activities", () => {
    expect(
      derivePendingApprovals([
        {
          id: "activity-1" as never,
          turnId: null,
          kind: "approval.requested",
          tone: "approval",
          summary: "Approval requested",
          createdAt: "2026-03-24T10:00:00.000Z",
          payload: {
            requestId: "approval-1",
            requestKind: "command",
            detail: "Run git status",
          },
        },
      ]),
    ).toEqual([
      {
        requestId: ApprovalRequestId.makeUnsafe("approval-1"),
        requestKind: "command",
        createdAt: "2026-03-24T10:00:00.000Z",
        detail: "Run git status",
      },
    ]);
  });

  it("merges messages, plans, and work entries into a sorted timeline", () => {
    expect(
      deriveTimelineEntries(
        [
          {
            id: "message-1" as never,
            createdAt: "2026-03-24T10:00:02.000Z",
            role: "user",
            text: "hello",
            attachments: [],
            streaming: false,
          },
        ],
        [
          {
            id: "plan-1",
            createdAt: "2026-03-24T10:00:03.000Z",
            updatedAt: "2026-03-24T10:00:03.000Z",
            turnId: null,
            planMarkdown: "1. Ship it",
            implementedAt: null,
            implementationThreadId: null,
          },
        ],
        [
          {
            id: "work-1",
            createdAt: "2026-03-24T10:00:01.000Z",
            label: "Checked repo",
            tone: "info",
          },
        ],
      ).map((entry) => entry.id),
    ).toEqual(["work-1", "message-1", "plan-1"]);
  });
});

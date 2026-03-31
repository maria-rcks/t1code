import { describe, expect, it } from "vitest";

import { isThreadActivelyWorking, isThreadSessionActivelyWorking } from "./threadSessionState";

describe("threadSessionState", () => {
  it("treats startup states as actively working", () => {
    expect(isThreadSessionActivelyWorking({ status: "starting", activeTurnId: null })).toBe(true);
    expect(isThreadSessionActivelyWorking({ status: "connecting", activeTurnId: null })).toBe(true);
  });

  it("requires an active turn for running sessions", () => {
    expect(isThreadSessionActivelyWorking({ status: "running", activeTurnId: "turn-1" })).toBe(
      true,
    );
    expect(isThreadSessionActivelyWorking({ status: "running", activeTurnId: null })).toBe(false);
  });

  it("ignores settled and missing sessions", () => {
    expect(isThreadSessionActivelyWorking({ status: "ready", activeTurnId: null })).toBe(false);
    expect(isThreadSessionActivelyWorking({ status: "stopped", activeTurnId: null })).toBe(false);
    expect(isThreadSessionActivelyWorking(null)).toBe(false);
  });

  it("treats threads with a running latest turn as actively working", () => {
    expect(
      isThreadActivelyWorking({
        session: { status: "ready", activeTurnId: null },
        latestTurn: { state: "running", completedAt: null },
      }),
    ).toBe(true);
  });

  it("ignores settled latest turns", () => {
    expect(
      isThreadActivelyWorking({
        session: { status: "ready", activeTurnId: null },
        latestTurn: { state: "completed", completedAt: "2026-03-31T00:00:00.000Z" },
      }),
    ).toBe(false);
  });
});

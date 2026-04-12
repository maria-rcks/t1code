import { describe, expect, it } from "vitest";

import { isThreadSessionActivelyWorking } from "./threadSessionState";

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

  it("treats ready sessions with a tracked active turn as actively working", () => {
    expect(isThreadSessionActivelyWorking({ status: "ready", activeTurnId: "turn-1" })).toBe(true);
  });

  it("ignores settled and missing sessions", () => {
    expect(isThreadSessionActivelyWorking({ status: "ready", activeTurnId: null })).toBe(false);
    expect(isThreadSessionActivelyWorking({ status: "stopped", activeTurnId: null })).toBe(false);
    expect(isThreadSessionActivelyWorking(null)).toBe(false);
  });
});

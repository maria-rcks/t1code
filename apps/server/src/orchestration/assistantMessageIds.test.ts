import { describe, expect, it } from "vitest";
import { TurnId } from "@t3tools/contracts";

import { assistantMessageBaseKey, assistantMessageId } from "./assistantMessageIds.ts";

describe("assistant message ids", () => {
  it("scopes reused provider item ids to their turn", () => {
    const baseKey = assistantMessageBaseKey("assistant:session-1:segment:0", "turn-1", "event-1");

    const firstTurnId = assistantMessageId(baseKey, TurnId.make("turn-1"));
    const secondTurnId = assistantMessageId(baseKey, TurnId.make("turn-2"));

    expect(firstTurnId).toBe("assistant:turn-1:assistant:session-1:segment:0");
    expect(secondTurnId).toBe("assistant:turn-2:assistant:session-1:segment:0");
    expect(firstTurnId).not.toBe(secondTurnId);
  });

  it("falls back from item id to turn id and event id", () => {
    expect(assistantMessageBaseKey(undefined, "turn-1", "event-1")).toBe("turn-1");
    expect(assistantMessageBaseKey(undefined, undefined, "event-1")).toBe("event-1");
  });

  it("preserves the legacy shape when no turn id is available", () => {
    expect(assistantMessageId("item-1")).toBe("assistant:item-1");
  });
});

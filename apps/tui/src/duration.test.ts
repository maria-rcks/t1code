import * as Duration from "effect/Duration";
import { describe, expect, it } from "vitest";

import { durationToSeconds } from "./duration";

describe("durationToSeconds", () => {
  it("accepts live Effect durations", () => {
    expect(durationToSeconds(Duration.seconds(30))).toBe(30);
  });

  it("accepts JSON-decoded millisecond durations from server settings", () => {
    expect(durationToSeconds({ _id: "Duration", _tag: "Millis", millis: 45_000 })).toBe(45);
  });

  it("accepts raw millisecond values from encoded settings", () => {
    expect(durationToSeconds(12_500)).toBe(13);
  });

  it("falls back to zero for missing values instead of throwing during initial render", () => {
    expect(durationToSeconds(undefined)).toBe(0);
  });
});

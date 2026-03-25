import { describe, expect, it } from "vitest";

import { resolveUserMessageBubbleWidth } from "./messageLayout";

describe("resolveUserMessageBubbleWidth", () => {
  it("uses a constrained width in wide layouts too", () => {
    expect(resolveUserMessageBubbleWidth(96)).toBe("80%");
  });

  it("uses the same constrained width in narrow layouts", () => {
    expect(resolveUserMessageBubbleWidth(72)).toBe("80%");
    expect(resolveUserMessageBubbleWidth(48)).toBe("80%");
  });
});

import { describe, expect, it } from "vitest";

import { DEFAULT_THREAD_TITLE, truncateTitle, truncateTitleForDisplay } from "./threadTitle";

describe("threadTitle", () => {
  it("exports the placeholder title used before provider naming arrives", () => {
    expect(DEFAULT_THREAD_TITLE).toBe("New thread");
  });

  it("truncates long thread titles", () => {
    expect(truncateTitle("abcdefghij", 5)).toBe("abcde...");
  });

  it("truncates display titles from the end", () => {
    expect(truncateTitleForDisplay("Tell me thing the thing things about this project.", 20)).toBe(
      "Tell me thing the th...",
    );
  });
});

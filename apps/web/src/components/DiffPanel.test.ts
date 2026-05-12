import { describe, expect, it } from "vitest";

import { resolveTurnStripMaskImage } from "./DiffPanel.logic";

describe("resolveTurnStripMaskImage", () => {
  it("omits the mask when the turn strip cannot scroll", () => {
    expect(resolveTurnStripMaskImage({ canScrollLeft: false, canScrollRight: false })).toBe(
      undefined,
    );
  });

  it("adds left and right fade stops only when needed", () => {
    expect(resolveTurnStripMaskImage({ canScrollLeft: true, canScrollRight: false })).toContain(
      "transparent 24px, black 72px",
    );
    expect(resolveTurnStripMaskImage({ canScrollLeft: false, canScrollRight: true })).toContain(
      "black calc(100% - 72px), transparent calc(100% - 24px)",
    );
  });
});

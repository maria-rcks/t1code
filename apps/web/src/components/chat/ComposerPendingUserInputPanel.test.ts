import { describe, expect, it } from "vitest";

import { shouldUsePendingUserInputDigitShortcut } from "./ComposerPendingUserInputPanel";

describe("shouldUsePendingUserInputDigitShortcut", () => {
  it("ignores regular text inputs", () => {
    expect(
      shouldUsePendingUserInputDigitShortcut({
        isTextInputTarget: true,
        isInsideContentEditable: false,
        hasCustomAnswer: false,
      }),
    ).toBe(false);
  });

  it("lets nested contenteditable digit keys pass through after a custom answer starts", () => {
    expect(
      shouldUsePendingUserInputDigitShortcut({
        isTextInputTarget: false,
        isInsideContentEditable: true,
        hasCustomAnswer: true,
      }),
    ).toBe(false);
  });

  it("keeps empty nested contenteditable digit keys available as option shortcuts", () => {
    expect(
      shouldUsePendingUserInputDigitShortcut({
        isTextInputTarget: false,
        isInsideContentEditable: true,
        hasCustomAnswer: false,
      }),
    ).toBe(true);
  });
});

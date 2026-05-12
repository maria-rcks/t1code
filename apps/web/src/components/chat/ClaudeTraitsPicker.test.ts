import { describe, expect, it } from "vitest";

import { getSelectedClaudeTraits } from "./ClaudeTraitsPicker";

const CLAUDE_ULTRATHINK_MODEL = "claude-opus-4-6";

describe("getSelectedClaudeTraits", () => {
  it("allows generated Ultrathink prefixes to be switched away from normal effort controls", () => {
    const traits = getSelectedClaudeTraits(CLAUDE_ULTRATHINK_MODEL, "Ultrathink:\nInvestigate", {
      effort: "high",
    });

    expect(traits.ultrathinkPromptControlled).toBe(true);
    expect(traits.ultrathinkInBodyText).toBe(false);
  });

  it("detects user-authored ultrathink text in the prompt body", () => {
    const traits = getSelectedClaudeTraits(
      CLAUDE_ULTRATHINK_MODEL,
      "Ultrathink:\nplease ultrathink about this",
      { effort: "high" },
    );

    expect(traits.ultrathinkPromptControlled).toBe(true);
    expect(traits.ultrathinkInBodyText).toBe(true);
  });
});

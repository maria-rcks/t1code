import { describe, expect, it } from "vitest";

import { normalizeTerminalHistoryForDisplay } from "./terminalHistory";

describe("terminalHistory", () => {
  it("ignores OSC shell integration sequences before prompts", () => {
    const history = "\u001b]0;collab-public on main\u0007collab-public on main⇣]\n";

    expect(normalizeTerminalHistoryForDisplay(history)).toBe("collab-public on main⇣]\n");
  });

  it("replays carriage-return redraws used by prompts", () => {
    const history = "stale prompt\r\u001b[2Kcollab-public on main⇣]";

    expect(normalizeTerminalHistoryForDisplay(history)).toBe("collab-public on main⇣]");
  });

  it("applies absolute horizontal cursor moves", () => {
    const history = "abcde\u001b[1GX";

    expect(normalizeTerminalHistoryForDisplay(history)).toBe("Xbcde");
  });

  it("suppresses terminal capability query replies", () => {
    const history =
      "\u001b[>0q\u001b[>4;1m$p\u001b[?2027$p\u001b[?2031$p\u001b[?1004$p\u001b[?2004$p\u001b[?2026$p$ ";

    expect(normalizeTerminalHistoryForDisplay(history)).toBe("$ ");
  });
});

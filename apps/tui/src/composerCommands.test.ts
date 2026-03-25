import { describe, expect, it } from "vitest";

import {
  parseApprovalResponseCommand,
  parseStandaloneComposerModeCommand,
} from "./composerCommands";

describe("parseStandaloneComposerModeCommand", () => {
  it("parses standalone /plan commands", () => {
    expect(parseStandaloneComposerModeCommand(" /plan ")).toBe("plan");
  });

  it("parses standalone /default commands", () => {
    expect(parseStandaloneComposerModeCommand("/default")).toBe("default");
  });

  it("ignores non-standalone mode commands", () => {
    expect(parseStandaloneComposerModeCommand("/plan refine this")).toBeNull();
  });
});

describe("parseApprovalResponseCommand", () => {
  it("parses supported approval decisions", () => {
    expect(parseApprovalResponseCommand("/approve accept")).toBe("accept");
    expect(parseApprovalResponseCommand("/approve accept-for-session")).toBe("acceptForSession");
    expect(parseApprovalResponseCommand("/approve decline")).toBe("decline");
    expect(parseApprovalResponseCommand("/approve cancel")).toBe("cancel");
  });

  it("ignores invalid approval commands", () => {
    expect(parseApprovalResponseCommand("/approve maybe")).toBeNull();
    expect(parseApprovalResponseCommand("approve accept")).toBeNull();
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";

import { expandUserPath, normalizeWorkspaceRoot } from "./workspacePaths";

describe("workspace path helpers", () => {
  it("expands tilde from the user's home, not the TUI app home", () => {
    const userHomeDir = "/Users/maria";

    expect(expandUserPath("~", userHomeDir)).toBe("/Users/maria");
    expect(expandUserPath("~/.local/src/t3code", userHomeDir)).toBe(
      path.join("/Users/maria", ".local/src/t3code"),
    );
  });

  it("normalizes tilde workspace roots from the user's home", () => {
    expect(normalizeWorkspaceRoot(" ~/.local/src/t3code ", "/Users/maria")).toBe(
      path.resolve("/Users/maria/.local/src/t3code"),
    );
  });

  it("leaves non-tilde absolute paths unchanged after normalization", () => {
    expect(normalizeWorkspaceRoot("/tmp/project", "/Users/maria")).toBe(
      path.resolve("/tmp/project"),
    );
  });
});

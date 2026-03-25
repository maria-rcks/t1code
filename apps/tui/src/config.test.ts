import os from "node:os";
import { describe, expect, it, vi } from "vitest";

import { resolveTuiPaths } from "./config";

describe("resolveTuiPaths", () => {
  it("prefers TUI-specific paths", () => {
    const paths = resolveTuiPaths({
      T3CODE_HOME: "/tmp/t1-home",
      T3CODE_CONFIG_HOME: "/tmp/t1-config",
    });

    expect(paths).toEqual({
      homeDir: "/tmp/t1-home",
      configHomeDir: "/tmp/t1-config",
      prefsPath: "/tmp/t1-config/prefs.json",
      logPath: "/tmp/t1-config/tui.log",
      imagesDir: "/tmp/t1-config/images",
    });
  });

  it("defaults to ~/.t1 and ~/.config/t1code", () => {
    vi.spyOn(os, "homedir").mockReturnValue("/Users/tester");

    const paths = resolveTuiPaths({});

    expect(paths).toEqual({
      homeDir: "/Users/tester/.t1",
      configHomeDir: "/Users/tester/.config/t1code",
      prefsPath: "/Users/tester/.config/t1code/prefs.json",
      logPath: "/Users/tester/.config/t1code/tui.log",
      imagesDir: "/Users/tester/.config/t1code/images",
    });
  });
});

import { describe, expect, it } from "vitest";

import { isWindowsCommandNotFound, runProcess } from "./processRunner";

describe("runProcess", () => {
  it("fails when output exceeds max buffer in default mode", async () => {
    await expect(
      runProcess("node", ["-e", "process.stdout.write('x'.repeat(2048))"], { maxBufferBytes: 128 }),
    ).rejects.toThrow("exceeded stdout buffer limit");
  });

  it("truncates output when outputMode is truncate", async () => {
    const result = await runProcess("node", ["-e", "process.stdout.write('x'.repeat(2048))"], {
      maxBufferBytes: 128,
      outputMode: "truncate",
    });

    expect(result.code).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(128);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(false);
  });
});

describe("isWindowsCommandNotFound", () => {
  it("matches localized Windows cmd.exe command-not-found text", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    try {
      expect(
        isWindowsCommandNotFound(
          1,
          "wird nicht als interner oder externer Befehl, betriebsfahiges Programm oder Batch-Datei erkannt",
        ),
      ).toBe(true);
      expect(isWindowsCommandNotFound(1, "no se reconoce como un comando interno o externo")).toBe(
        true,
      );
      expect(isWindowsCommandNotFound(1, "ordinary process failure")).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("does not match localized Windows command errors on other platforms", () => {
    expect(
      isWindowsCommandNotFound(
        1,
        "wird nicht als interner oder externer Befehl, betriebsfahiges Programm oder Batch-Datei erkannt",
      ),
    ).toBe(false);
  });
});

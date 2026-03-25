import { describe, expect, it, vi } from "vitest";

import { createClipboardImageFileName, saveClipboardImageToFile } from "./clipboardImage";

describe("createClipboardImageFileName", () => {
  it("uses a short random id", () => {
    expect(createClipboardImageFileName("abc12")).toBe("abc12.png");
  });
});

describe("saveClipboardImageToFile", () => {
  it("returns null outside macOS", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");

    await expect(saveClipboardImageToFile("/tmp/ignored")).resolves.toBeNull();
  });
});

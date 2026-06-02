import { describe, expect, it } from "vitest";
import { isCommandPaletteProjectPathQuery } from "./commandPaletteProjects";

describe("isCommandPaletteProjectPathQuery", () => {
  it("detects explicit project path inputs", () => {
    expect(isCommandPaletteProjectPathQuery("~/.local/src/t3code")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("~/")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("/tmp/project")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("./project")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("../project")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("C:\\Users\\maria\\project")).toBe(true);
    expect(isCommandPaletteProjectPathQuery("\\\\server\\share\\project")).toBe(true);
  });

  it("does not treat ordinary command searches as project paths", () => {
    expect(isCommandPaletteProjectPathQuery("diag")).toBe(false);
    expect(isCommandPaletteProjectPathQuery("add project")).toBe(false);
    expect(isCommandPaletteProjectPathQuery("github repo")).toBe(false);
    expect(isCommandPaletteProjectPathQuery("")).toBe(false);
  });
});

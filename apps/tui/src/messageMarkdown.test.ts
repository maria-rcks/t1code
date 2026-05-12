import { describe, expect, it } from "vitest";

import {
  isDiffLikeCodeBlockFiletype,
  parseMessageMarkdownSegments,
  resolveCodeBlockFiletype,
} from "./messageMarkdown";

describe("parseMessageMarkdownSegments", () => {
  it("keeps plain markdown as a single segment", () => {
    expect(parseMessageMarkdownSegments("hello\n\nworld")).toEqual([
      { kind: "markdown", content: "hello\n\nworld" },
    ]);
  });

  it("extracts fenced code blocks and their language", () => {
    expect(parseMessageMarkdownSegments("before\n```ts\nconst x = 1;\n```\nafter")).toEqual([
      { kind: "markdown", content: "before" },
      { kind: "code", content: "const x = 1;", language: "ts" },
      { kind: "markdown", content: "after" },
    ]);
  });

  it("supports tilde fences and ignores extra info strings", () => {
    expect(
      parseMessageMarkdownSegments("~~~typescript title=example.ts\nconsole.log(1)\n~~~"),
    ).toEqual([{ kind: "code", content: "console.log(1)", language: "typescript" }]);
  });

  it("treats unclosed fences as code until the end", () => {
    expect(parseMessageMarkdownSegments("```js\nconsole.log('x')")).toEqual([
      { kind: "code", content: "console.log('x')", language: "js" },
    ]);
  });

  it("normalizes patch-style fence languages to diff", () => {
    expect(resolveCodeBlockFiletype("patch")).toBe("diff");
    expect(resolveCodeBlockFiletype("udiff")).toBe("diff");
    expect(resolveCodeBlockFiletype("unified-diff")).toBe("diff");
    expect(resolveCodeBlockFiletype("ts")).toBe("ts");
  });

  it("detects diff-like code block filetypes", () => {
    expect(isDiffLikeCodeBlockFiletype("diff")).toBe(true);
    expect(isDiffLikeCodeBlockFiletype("typescript")).toBe(false);
    expect(isDiffLikeCodeBlockFiletype(undefined)).toBe(false);
  });
});

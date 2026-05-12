import { describe, expect, it, vi } from "vitest";

const filetypeByExtension = new Map([
  ["go", "go"],
  ["js", "javascript"],
  ["jsx", "javascriptreact"],
  ["md", "markdown"],
  ["patch", "diff"],
  ["py", "python"],
  ["rs", "rust"],
  ["ts", "typescript"],
  ["tsx", "typescriptreact"],
]);

vi.mock("@opentui/core", () => ({
  infoStringToFiletype: (infoString: string) => {
    const token = infoString.trim().split(/\s+/, 1)[0]?.replace(/^\./, "").toLowerCase();
    if (!token) return undefined;
    if (token === "dockerfile") return "dockerfile";
    const extension = token.includes(".") ? token.slice(token.lastIndexOf(".") + 1) : token;
    return filetypeByExtension.get(extension) ?? token;
  },
}));

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
  });

  it("normalizes code fence info strings through OpenTUI filetype resolution", () => {
    expect(resolveCodeBlockFiletype("js")).toBe("javascript");
    expect(resolveCodeBlockFiletype("jsx")).toBe("javascriptreact");
    expect(resolveCodeBlockFiletype("ts")).toBe("typescript");
    expect(resolveCodeBlockFiletype("tsx")).toBe("typescriptreact");
    expect(resolveCodeBlockFiletype("py")).toBe("python");
    expect(resolveCodeBlockFiletype("main.rs")).toBe("rust");
    expect(resolveCodeBlockFiletype("Dockerfile")).toBe("dockerfile");
    expect(resolveCodeBlockFiletype("go")).toBe("go");
  });

  it("detects diff-like code block filetypes", () => {
    expect(isDiffLikeCodeBlockFiletype("diff")).toBe(true);
    expect(isDiffLikeCodeBlockFiletype("typescript")).toBe(false);
    expect(isDiffLikeCodeBlockFiletype(undefined)).toBe(false);
  });
});

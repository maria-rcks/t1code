import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), resolvedTheme: "light" as const }),
}));

import ChatMarkdown from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  it("adds noopener to external links opened in a new tab", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown text="[docs](https://example.com/docs)" cwd={undefined} />,
    );

    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
  });

  it("renders provider skill references as inline chips in markdown text", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown
        text={"Use $planner here.\n\n- Then $code-review"}
        cwd={undefined}
        skills={[
          {
            name: "planner",
            displayName: "Planner",
          },
          {
            name: "code-review",
            displayName: "Code Review",
          },
        ]}
      />,
    );

    expect(markup).toContain('class="sr-only">$planner</span>');
    expect(markup).toContain('class="sr-only">$code-review</span>');
    expect(markup).toContain(">Planner</span>");
    expect(markup).toContain(">Code Review</span>");
  });

  it("does not render skill chips inside links or inline code", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown
        text={"Keep [`$planner`](https://example.com) and `$planner` literal, but render $planner."}
        cwd={undefined}
        skills={[
          {
            name: "planner",
            displayName: "Planner",
          },
        ]}
      />,
    );

    expect(markup.match(/class="sr-only">\$planner<\/span>/g)).toHaveLength(1);
    expect(markup).toContain("<code>$planner</code>");
    expect(markup).toContain('href="https://example.com"');
  });

  it("uses compact line height for fenced code blocks", () => {
    const markup = renderToStaticMarkup(
      <ChatMarkdown text={"```js\nconst value = 1;\n```"} cwd={undefined} />,
    );

    expect(markup).toContain("chat-markdown-codeblock leading-snug");
  });
});

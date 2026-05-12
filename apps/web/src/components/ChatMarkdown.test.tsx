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
});

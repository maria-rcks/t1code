import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ComposerCommandMenu, type ComposerCommandItem } from "./ComposerCommandMenu";

const items: ComposerCommandItem[] = [
  {
    id: "slash-plan",
    type: "slash-command",
    command: "plan",
    label: "/plan",
    description: "Create a plan",
  },
];

describe("ComposerCommandMenu", () => {
  it("suppresses base highlighted styles in favor of the controlled active item", () => {
    const markup = renderToStaticMarkup(
      <ComposerCommandMenu
        items={items}
        resolvedTheme="light"
        isLoading={false}
        triggerKind="slash-command"
        activeItemId="slash-plan"
        onHighlightedItemChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("data-highlighted:bg-transparent");
    expect(markup).toContain("bg-accent!");
  });
});

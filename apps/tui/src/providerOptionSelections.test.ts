import { describe, expect, it } from "vitest";
import {
  filterProviderOptionSelectionsForDescriptors,
  mergeProviderOptionSelections,
  modelOptionsToProviderOptionSelections,
  providerOptionTraitsLabel,
  selectedContextWindowLabel,
  setProviderOptionSelection,
} from "./providerOptionSelections";

describe("provider option selections", () => {
  it("merges generic selections over legacy model options", () => {
    expect(
      mergeProviderOptionSelections(
        [
          { id: "effort", value: "high" },
          { id: "fastMode", value: true },
        ],
        [
          { id: "effort", value: "xhigh" },
          { id: "contextWindow", value: "1m" },
        ],
      ),
    ).toEqual([
      { id: "effort", value: "xhigh" },
      { id: "fastMode", value: true },
      { id: "contextWindow", value: "1m" },
    ]);
  });

  it("upserts a single selection", () => {
    expect(
      setProviderOptionSelection([{ id: "contextWindow", value: "200k" }], {
        id: "contextWindow",
        value: "1m",
      }),
    ).toEqual([{ id: "contextWindow", value: "1m" }]);
  });

  it("filters stale selections against the current model descriptors", () => {
    expect(
      filterProviderOptionSelectionsForDescriptors(
        [
          { id: "contextWindow", value: "1m" },
          { id: "fastMode", value: true },
        ],
        [
          {
            id: "contextWindow",
            label: "Context Window",
            type: "select",
            options: [{ id: "1m", label: "1M" }],
          },
        ],
      ),
    ).toEqual([{ id: "contextWindow", value: "1m" }]);
  });

  it("converts legacy provider model options into generic selections", () => {
    expect(
      modelOptionsToProviderOptionSelections("claudeAgent", {
        claudeAgent: { effort: "high", thinking: false, fastMode: true },
      }),
    ).toEqual([
      { id: "thinking", value: false },
      { id: "effort", value: "high" },
      { id: "fastMode", value: true },
    ]);
  });

  it("labels descriptor-backed effort values outside legacy Claude options", () => {
    expect(
      providerOptionTraitsLabel(
        [
          {
            id: "effort",
            label: "Reasoning",
            type: "select",
            currentValue: "xhigh",
            options: [
              { id: "high", label: "High" },
              { id: "xhigh", label: "Extra High", isDefault: true },
            ],
          },
        ],
        "",
      ),
    ).toBe("Extra High");
  });

  it("includes non-default context window labels", () => {
    const descriptors = [
      {
        id: "contextWindow",
        label: "Context Window",
        type: "select" as const,
        currentValue: "1m",
        options: [
          { id: "200k", label: "200k", isDefault: true },
          { id: "1m", label: "1M" },
        ],
      },
    ];

    expect(selectedContextWindowLabel(descriptors)).toBe("1M");
    expect(providerOptionTraitsLabel(descriptors, "")).toBe("1M ctx");
  });
});

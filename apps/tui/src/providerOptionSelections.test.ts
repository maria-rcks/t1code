import { describe, expect, it } from "vitest";
import {
  filterProviderOptionSelectionsForDescriptors,
  mergeProviderOptionSelections,
  modelOptionsToProviderOptionSelections,
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
});

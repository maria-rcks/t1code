import { assert, describe, it } from "@effect/vitest";
import { ClaudeSettings, ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { Effect, Schema } from "effect";

import {
  getClaudeModelCapabilities,
  makePendingClaudeProvider,
  normalizeClaudeCliEffort,
  resolveClaudeApiModelId,
  resolveClaudeEffort,
} from "./ClaudeProvider";

const decodeClaudeSettings = Schema.decodeUnknownSync(ClaudeSettings);
const decodeModelSelection = Schema.decodeUnknownSync(ModelSelection);
const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

describe("ClaudeProvider", () => {
  it("resolves Claude option capabilities and effort values", () => {
    const caps = getClaudeModelCapabilities("claude-opus-4-7");

    assert.equal(resolveClaudeEffort(caps, undefined), "xhigh");
    assert.equal(resolveClaudeEffort(caps, "low"), "low");
    assert.equal(resolveClaudeEffort(caps, "ultrathink"), "xhigh");
    assert.equal(normalizeClaudeCliEffort("xhigh"), "max");
    assert.equal(normalizeClaudeCliEffort("ultrathink"), undefined);
  });

  it("adds 1m context suffix to Claude API model ids", () => {
    const selection = decodeModelSelection({
      instanceId: decodeProviderInstanceId("claudeAgent"),
      model: "claude-opus-4-7",
      options: [{ id: "contextWindow", value: "1m" }],
    });

    assert.equal(resolveClaudeApiModelId(selection), "claude-opus-4-7[1m]");
    assert.equal(
      resolveClaudeApiModelId(
        decodeModelSelection({
          instanceId: decodeProviderInstanceId("claudeAgent"),
          model: "claude-opus-4-7",
        }),
      ),
      "claude-opus-4-7",
    );
  });

  it.effect("builds pending disabled snapshots", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingClaudeProvider(
        decodeClaudeSettings({
          enabled: false,
          customModels: ["custom-claude"],
        }),
      );

      assert.equal(snapshot.displayName, "Claude");
      assert.equal(snapshot.enabled, false);
      assert.equal(snapshot.status, "disabled");
      assert.equal(snapshot.auth.status, "unknown");
      assert.equal(snapshot.message, "Claude is disabled in T3 Code settings.");
      assert.equal(
        snapshot.models.some((model) => model.slug === "custom-claude" && model.isCustom),
        true,
      );
    }),
  );

  it.effect("builds pending enabled snapshots", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingClaudeProvider(decodeClaudeSettings({}));

      assert.equal(snapshot.displayName, "Claude");
      assert.equal(snapshot.enabled, true);
      assert.equal(snapshot.status, "warning");
      assert.equal(
        snapshot.message,
        "Claude provider status has not been checked in this session yet.",
      );
    }),
  );
});

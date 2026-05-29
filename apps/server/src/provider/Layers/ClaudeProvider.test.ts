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
    const opus48Caps = getClaudeModelCapabilities("claude-opus-4-8");
    const opus47Caps = getClaudeModelCapabilities("claude-opus-4-7");

    assert.equal(resolveClaudeEffort(opus48Caps, undefined), "high");
    assert.equal(resolveClaudeEffort(opus48Caps, "ultracode"), "ultracode");
    assert.equal(resolveClaudeEffort(opus47Caps, undefined), "xhigh");
    assert.equal(resolveClaudeEffort(opus47Caps, "low"), "low");
    assert.equal(resolveClaudeEffort(opus47Caps, "ultrathink"), "xhigh");
    assert.equal(normalizeClaudeCliEffort("xhigh", "claude-opus-4-8"), "xhigh");
    assert.equal(normalizeClaudeCliEffort("xhigh", "claude-opus-4-7"), "max");
    assert.equal(normalizeClaudeCliEffort("ultracode", "claude-opus-4-8"), "xhigh");
    assert.equal(normalizeClaudeCliEffort("max", "claude-sonnet-4-6"), "high");
    assert.equal(normalizeClaudeCliEffort("ultrathink", "claude-opus-4-8"), undefined);
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

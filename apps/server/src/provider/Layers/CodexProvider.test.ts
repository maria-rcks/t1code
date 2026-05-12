import { assert, describe, it } from "@effect/vitest";
import { CodexSettings } from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import * as CodexErrors from "effect-codex-app-server/errors";

import {
  checkCodexProviderStatus,
  makePendingCodexProvider,
  type CodexAppServerProviderSnapshot,
} from "./CodexProvider";

const decodeCodexSettings = Schema.decodeUnknownSync(CodexSettings);

const unusedSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("unexpected Codex process spawn")),
);

const authenticatedSnapshot: CodexAppServerProviderSnapshot = {
  account: {
    requiresOpenaiAuth: false,
    account: {
      type: "chatgpt",
      email: "maria@example.com",
      planType: "plus",
    },
  },
  version: "1.2.3",
  models: [
    {
      slug: "gpt-5.2",
      name: "GPT-5.2",
      isCustom: false,
      capabilities: null,
    },
  ],
  skills: [
    {
      name: "repo-search",
      path: "/tmp/repo-search",
      enabled: true,
    },
  ],
};

describe("CodexProvider", () => {
  it.effect("builds pending disabled snapshots", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingCodexProvider(
        decodeCodexSettings({
          enabled: false,
          customModels: ["gpt-custom"],
        }),
      );

      assert.equal(snapshot.displayName, "Codex");
      assert.equal(snapshot.enabled, false);
      assert.equal(snapshot.status, "disabled");
      assert.equal(snapshot.auth.status, "unknown");
      assert.equal(snapshot.message, "Codex is disabled in T3 Code settings.");
      assert.equal(
        snapshot.models.some((model) => model.slug === "gpt-custom" && model.isCustom),
        true,
      );
    }),
  );

  it.effect("builds pending enabled snapshots", () =>
    Effect.gen(function* () {
      const snapshot = yield* makePendingCodexProvider(decodeCodexSettings({}));

      assert.equal(snapshot.displayName, "Codex");
      assert.equal(snapshot.enabled, true);
      assert.equal(snapshot.status, "warning");
      assert.equal(
        snapshot.message,
        "Codex provider status has not been checked in this session yet.",
      );
    }),
  );

  it.effect("builds ready snapshots from app-server probe data", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkCodexProviderStatus(
        decodeCodexSettings({ binaryPath: "codex", customModels: ["gpt-custom"] }),
        () => Effect.succeed(authenticatedSnapshot),
      );

      assert.equal(snapshot.displayName, "Codex");
      assert.equal(snapshot.enabled, true);
      assert.equal(snapshot.installed, true);
      assert.equal(snapshot.version, "1.2.3");
      assert.equal(snapshot.status, "ready");
      assert.deepEqual(snapshot.auth, {
        status: "authenticated",
        type: "chatgpt",
        label: "ChatGPT Plus Subscription",
        email: "maria@example.com",
      });
      assert.deepEqual(snapshot.models, authenticatedSnapshot.models);
      assert.deepEqual(snapshot.skills, authenticatedSnapshot.skills);
    }).pipe(Effect.provide(unusedSpawnerLayer)),
  );

  it.effect("reports unauthenticated app-server accounts", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkCodexProviderStatus(decodeCodexSettings({}), () =>
        Effect.succeed({
          ...authenticatedSnapshot,
          account: {
            requiresOpenaiAuth: true,
            account: null,
          },
          models: [],
          skills: [],
        }),
      );

      assert.equal(snapshot.status, "error");
      assert.deepEqual(snapshot.auth, { status: "unauthenticated" });
      assert.equal(
        snapshot.message,
        "Codex CLI is not authenticated. Run `codex login` and try again.",
      );
    }).pipe(Effect.provide(unusedSpawnerLayer)),
  );

  it.effect("reports missing Codex CLI spawn failures", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkCodexProviderStatus(decodeCodexSettings({}), () =>
        Effect.fail(
          new CodexErrors.CodexAppServerSpawnError({
            command: "codex",
            cause: new Error("missing"),
          }),
        ),
      );

      assert.equal(snapshot.installed, false);
      assert.equal(snapshot.status, "error");
      assert.equal(snapshot.message, "Codex CLI (`codex`) is not installed or not on PATH.");
    }).pipe(Effect.provide(unusedSpawnerLayer)),
  );
});

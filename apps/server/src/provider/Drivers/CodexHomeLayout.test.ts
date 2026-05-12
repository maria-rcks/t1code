import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { CodexSettings } from "@t3tools/contracts";
import { Effect, FileSystem, Path, Schema } from "effect";

import {
  CodexShadowHomeError,
  materializeCodexShadowHome,
  resolveCodexHomeLayout,
} from "./CodexHomeLayout";

const decodeCodexSettingsValue = Schema.decodeSync(CodexSettings);

const decodeCodexSettings = (input: {
  readonly enabled?: boolean;
  readonly homePath?: string;
  readonly shadowHomePath?: string;
  readonly customModels?: readonly string[];
  readonly binaryPath?: string;
}): CodexSettings => decodeCodexSettingsValue(input);

const makeTempDir = Effect.fn("CodexHomeLayout.test.makeTempDir")(function* (prefix: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix });
});

const writeTextFile = Effect.fn("CodexHomeLayout.test.writeTextFile")(function* (
  filePath: string,
  contents: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.dirname(filePath), { recursive: true });
  yield* fileSystem.writeFileString(filePath, contents);
});

it.layer(NodeServices.layer)("CodexHomeLayout", (it) => {
  describe("resolveCodexHomeLayout", () => {
    it.effect("uses direct CODEX_HOME when no shadow home is configured", () =>
      Effect.gen(function* () {
        const homePath = yield* makeTempDir("t3code-codex-home-");

        const layout = yield* resolveCodexHomeLayout(
          decodeCodexSettings({
            homePath,
          }),
        );

        assert.deepEqual(
          {
            mode: layout.mode,
            sharedHomePath: layout.sharedHomePath,
            effectiveHomePath: layout.effectiveHomePath,
            continuationKey: layout.continuationKey,
          },
          {
            mode: "direct",
            sharedHomePath: homePath,
            effectiveHomePath: homePath,
            continuationKey: `codex:home:${homePath}`,
          },
        );
      }),
    );

    it.effect("uses the shared home for continuation and the shadow home for runtime", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const sharedHome = yield* makeTempDir("t3code-codex-shared-");
        const shadowRoot = yield* makeTempDir("t3code-codex-shadow-root-");
        const shadowHome = path.join(shadowRoot, "shadow");

        const layout = yield* resolveCodexHomeLayout(
          decodeCodexSettings({
            homePath: sharedHome,
            shadowHomePath: shadowHome,
          }),
        );

        assert.equal(layout.mode, "authOverlay");
        assert.equal(layout.sharedHomePath, sharedHome);
        assert.equal(layout.effectiveHomePath, shadowHome);
        assert.equal(layout.continuationKey, `codex:home:${sharedHome}`);
      }),
    );
  });

  describe("materializeCodexShadowHome", () => {
    it.effect("materializes a shadow home with shared state links and private auth", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sharedHome = yield* makeTempDir("t3code-codex-shared-");
        const shadowRoot = yield* makeTempDir("t3code-codex-shadow-root-");
        const shadowHome = path.join(shadowRoot, "shadow");

        yield* fileSystem.makeDirectory(path.join(sharedHome, "sessions"));
        yield* writeTextFile(path.join(sharedHome, "config.toml"), 'model = "gpt-5-codex"\n');
        yield* writeTextFile(path.join(sharedHome, "models_cache.json"), '{"models":["shared"]}\n');
        yield* writeTextFile(path.join(sharedHome, "auth.json"), '{"shared":true}\n');
        yield* fileSystem.makeDirectory(shadowHome, { recursive: true });
        yield* writeTextFile(path.join(shadowHome, "auth.json"), '{"shadow":true}\n');
        yield* fileSystem.symlink(
          path.join(sharedHome, "models_cache.json"),
          path.join(shadowHome, "models_cache.json"),
        );

        const layout = yield* resolveCodexHomeLayout(
          decodeCodexSettings({
            homePath: sharedHome,
            shadowHomePath: shadowHome,
          }),
        );

        yield* materializeCodexShadowHome(layout);

        const sessionsTarget = yield* fileSystem.readLink(path.join(shadowHome, "sessions"));
        const configTarget = yield* fileSystem.readLink(path.join(shadowHome, "config.toml"));
        const modelsCacheExists = yield* fileSystem.exists(
          path.join(shadowHome, "models_cache.json"),
        );
        const authLinkResult = yield* fileSystem
          .readLink(path.join(shadowHome, "auth.json"))
          .pipe(Effect.result);
        const authContents = yield* fileSystem.readFileString(path.join(shadowHome, "auth.json"));

        assert.equal(sessionsTarget, path.join(sharedHome, "sessions"));
        assert.equal(configTarget, path.join(sharedHome, "config.toml"));
        assert.equal(modelsCacheExists, false);
        assert.equal(authLinkResult._tag, "Failure");
        assert.equal(authContents.includes("shadow"), true);
      }),
    );

    it.effect("rejects shadow homes that point at the shared home", () =>
      Effect.gen(function* () {
        const sharedHome = yield* makeTempDir("t3code-codex-shared-");
        const layout = yield* resolveCodexHomeLayout(
          decodeCodexSettings({
            homePath: sharedHome,
            shadowHomePath: sharedHome,
          }),
        );

        const error = yield* materializeCodexShadowHome(layout).pipe(Effect.flip);

        assert.equal(Schema.is(CodexShadowHomeError)(error), true);
      }),
    );
  });
});

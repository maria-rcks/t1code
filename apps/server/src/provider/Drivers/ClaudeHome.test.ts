import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Path } from "effect";

import {
  makeClaudeCapabilitiesCacheKey,
  makeClaudeContinuationGroupKey,
  makeClaudeEnvironment,
  resolveClaudeHomePath,
} from "./ClaudeHome";

it.layer(NodeServices.layer)("ClaudeHome", (it) => {
  describe("Claude home resolution", () => {
    it.effect("uses the process home when no Claude home override is configured", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const resolved = path.resolve(NodeOS.homedir());

        assert.equal(yield* resolveClaudeHomePath({ homePath: "" }), resolved);
        assert.equal(yield* makeClaudeEnvironment({ homePath: "" }), process.env);
      }),
    );

    it.effect("resolves configured Claude HOME and stamps continuation/cache keys with it", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const homePath = "~/.claude-work";
        const resolved = path.resolve(NodeOS.homedir(), ".claude-work");

        assert.equal(yield* resolveClaudeHomePath({ homePath }), resolved);
        assert.equal((yield* makeClaudeEnvironment({ homePath })).HOME, resolved);
        assert.equal(
          yield* makeClaudeContinuationGroupKey({ homePath }),
          `claude:home:${resolved}`,
        );
        assert.equal(
          yield* makeClaudeCapabilitiesCacheKey({ binaryPath: "claude", homePath }),
          `claude\0${resolved}`,
        );
      }),
    );
  });
});

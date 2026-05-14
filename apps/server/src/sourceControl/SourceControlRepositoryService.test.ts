import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { ServerConfig, type ServerConfigShape } from "../config";
import { GitHubCli, type GitHubCliShape } from "../git/Services/GitHubCli";
import {
  SourceControlRepositoryService,
  SourceControlRepositoryServiceLive,
} from "./SourceControlRepositoryService";

const serverConfigLayer = Layer.succeed(ServerConfig, {
  mode: "web",
  port: 0,
  cwd: "/workspace",
  host: undefined,
  baseDir: "/tmp/t3code-test",
  stateDir: "/tmp/t3code-test/state",
  dbPath: "/tmp/t3code-test/state/state.sqlite",
  settingsPath: "/tmp/t3code-test/state/settings.json",
  providerStatusCacheDir: "/tmp/t3code-test/caches",
  worktreesDir: "/tmp/t3code-test/worktrees",
  attachmentsDir: "/tmp/t3code-test/state/attachments",
  logsDir: "/tmp/t3code-test/logs",
  keybindingsConfigPath: "/tmp/t3code-test/keybindings.json",
  serverLogPath: "/tmp/t3code-test/logs/server.log",
  serverTracePath: "/tmp/t3code-test/server.ndjson",
  providerLogsDir: "/tmp/t3code-test/logs/provider",
  providerEventLogPath: "/tmp/t3code-test/logs/provider/events.ndjson",
  terminalLogsDir: "/tmp/t3code-test/logs/terminal",
  anonymousIdPath: "/tmp/t3code-test/anonymous-id",
  secretsDir: "/tmp/t3code-test/secrets",
  staticDir: undefined,
  devUrl: undefined,
  noBrowser: true,
  authToken: undefined,
  autoBootstrapProjectFromCwd: false,
  logWebSocketEvents: false,
} satisfies ServerConfigShape);

function makeLayer(gitHubCli: Pick<GitHubCliShape, "getRepositoryCloneUrls">) {
  return SourceControlRepositoryServiceLive.pipe(
    Layer.provideMerge(serverConfigLayer),
    Layer.provideMerge(
      Layer.succeed(GitHubCli, {
        getRepositoryCloneUrls: gitHubCli.getRepositoryCloneUrls,
      } as GitHubCliShape),
    ),
  );
}

describe("SourceControlRepositoryService", () => {
  it("looks up GitHub repository clone URLs", async () => {
    const layer = makeLayer({
      getRepositoryCloneUrls: (input) =>
        Effect.succeed({
          nameWithOwner: input.repository,
          url: `https://github.com/${input.repository}`,
          sshUrl: `git@github.com:${input.repository}.git`,
        }),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.lookupRepository({
          provider: "github",
          repository: "octocat/hello-world",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toEqual({
      provider: "github",
      nameWithOwner: "octocat/hello-world",
      url: "https://github.com/octocat/hello-world",
      sshUrl: "git@github.com:octocat/hello-world.git",
    });
  });

  it("rejects unsupported repository providers", async () => {
    const layer = makeLayer({
      getRepositoryCloneUrls: () => Effect.die("should not be called"),
    });

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.lookupRepository({
          provider: "gitlab",
          repository: "group/project",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
  });
});

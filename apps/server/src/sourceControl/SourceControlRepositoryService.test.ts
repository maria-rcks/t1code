import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerConfig, type ServerConfigShape } from "../config";
import { GitCore, type GitCoreShape } from "../git/Services/GitCore";
import { GitHubCli, type GitHubCliShape } from "../git/Services/GitHubCli";
import {
  SourceControlRepositoryService,
  SourceControlRepositoryServiceLive,
} from "./SourceControlRepositoryService";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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

function makeLayer(input: {
  gitHubCli: Pick<GitHubCliShape, "getRepositoryCloneUrls">;
  gitCore?: Pick<GitCoreShape, "execute">;
}) {
  return SourceControlRepositoryServiceLive.pipe(
    Layer.provideMerge(serverConfigLayer),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(
      Layer.succeed(GitHubCli, {
        getRepositoryCloneUrls: input.gitHubCli.getRepositoryCloneUrls,
      } as GitHubCliShape),
    ),
    Layer.provideMerge(
      Layer.succeed(GitCore, {
        execute:
          input.gitCore?.execute ??
          (() => Effect.die("GitCore.execute should not be called in this test")),
      } as GitCoreShape),
    ),
  );
}

describe("SourceControlRepositoryService", () => {
  it("looks up GitHub repository clone URLs", async () => {
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: (input) =>
          Effect.succeed({
            nameWithOwner: input.repository,
            url: `https://github.com/${input.repository}`,
            sshUrl: `git@github.com:${input.repository}.git`,
          }),
      },
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
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("should not be called"),
      },
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

  it("clones a repository URL into the prepared destination path", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-");
    const destinationPath = path.join(parentDir, "hello-world");
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: { execute },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          remoteUrl: "https://github.com/octocat/hello-world.git",
          destinationPath,
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toEqual({
      cwd: destinationPath,
      remoteUrl: "https://github.com/octocat/hello-world.git",
      repository: null,
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: parentDir,
      args: ["clone", "https://github.com/octocat/hello-world.git", "hello-world"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
  });

  it("resolves repository clone URLs before cloning provider repositories", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-provider-");
    const destinationPath = path.join(parentDir, "hello-world");
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
      }),
    );
    const getRepositoryCloneUrls = vi.fn<GitHubCliShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://github.com/${input.repository}`,
        sshUrl: `git@github.com:${input.repository}.git`,
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls,
      },
      gitCore: { execute },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          provider: "github",
          repository: "octocat/hello-world",
          destinationPath,
          protocol: "https",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: parentDir,
      repository: "octocat/hello-world",
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: parentDir,
      args: ["clone", "https://github.com/octocat/hello-world", "hello-world"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
    expect(result.repository).toEqual({
      provider: "github",
      nameWithOwner: "octocat/hello-world",
      url: "https://github.com/octocat/hello-world",
      sshUrl: "git@github.com:octocat/hello-world.git",
    });
  });

  it("rejects non-empty clone destinations before running git", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-nonempty-");
    const destinationPath = path.join(parentDir, "hello-world");
    fs.mkdirSync(destinationPath);
    fs.writeFileSync(path.join(destinationPath, "README.md"), "existing");
    const execute = vi.fn<GitCoreShape["execute"]>(() => Effect.die("should not be called"));
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: { execute },
    });

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          remoteUrl: "https://github.com/octocat/hello-world.git",
          destinationPath,
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result._tag).toBe("Failure");
    expect(execute).not.toHaveBeenCalled();
  });
});

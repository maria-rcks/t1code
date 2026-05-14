import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerConfig, type ServerConfigShape } from "../config";
import { GitCommandError } from "../git/Errors";
import { AzureDevOpsCli, type AzureDevOpsCliShape } from "../git/Services/AzureDevOpsCli";
import { GitCore, type GitCoreShape } from "../git/Services/GitCore";
import { GitHubCli, type GitHubCliShape } from "../git/Services/GitHubCli";
import { GitLabCli, type GitLabCliShape } from "../git/Services/GitLabCli";
import {
  SourceControlRepositoryService,
  SourceControlRepositoryServiceLive,
} from "./SourceControlRepositoryService";
import { BitbucketApi, type BitbucketApiShape } from "./BitbucketApi";

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
  azureDevOpsCli?: Partial<AzureDevOpsCliShape>;
  bitbucketApi?: Partial<BitbucketApiShape>;
  gitHubCli: Pick<GitHubCliShape, "getRepositoryCloneUrls"> & Partial<GitHubCliShape>;
  gitLabCli?: Partial<GitLabCliShape>;
  gitCore?: Pick<GitCoreShape, "execute"> & Partial<GitCoreShape>;
}) {
  return SourceControlRepositoryServiceLive.pipe(
    Layer.provideMerge(serverConfigLayer),
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(
      Layer.succeed(AzureDevOpsCli, {
        execute:
          input.azureDevOpsCli?.execute ??
          (() => Effect.die("AzureDevOpsCli.execute should not be called in this test")),
        getRepositoryCloneUrls:
          input.azureDevOpsCli?.getRepositoryCloneUrls ??
          (() =>
            Effect.die("AzureDevOpsCli.getRepositoryCloneUrls should not be called in this test")),
        createRepository:
          input.azureDevOpsCli?.createRepository ??
          (() => Effect.die("AzureDevOpsCli.createRepository should not be called in this test")),
      } as AzureDevOpsCliShape),
    ),
    Layer.provideMerge(
      Layer.succeed(BitbucketApi, {
        getRepositoryCloneUrls:
          input.bitbucketApi?.getRepositoryCloneUrls ??
          (() =>
            Effect.die("BitbucketApi.getRepositoryCloneUrls should not be called in this test")),
        createRepository:
          input.bitbucketApi?.createRepository ??
          (() => Effect.die("BitbucketApi.createRepository should not be called in this test")),
      } as BitbucketApiShape),
    ),
    Layer.provideMerge(
      Layer.succeed(GitHubCli, {
        getRepositoryCloneUrls: input.gitHubCli.getRepositoryCloneUrls,
        createRepository:
          input.gitHubCli.createRepository ??
          (() => Effect.die("GitHubCli.createRepository should not be called in this test")),
      } as GitHubCliShape),
    ),
    Layer.provideMerge(
      Layer.succeed(GitLabCli, {
        execute:
          input.gitLabCli?.execute ??
          (() => Effect.die("GitLabCli.execute should not be called in this test")),
        getRepositoryCloneUrls:
          input.gitLabCli?.getRepositoryCloneUrls ??
          (() => Effect.die("GitLabCli.getRepositoryCloneUrls should not be called in this test")),
        createRepository:
          input.gitLabCli?.createRepository ??
          (() => Effect.die("GitLabCli.createRepository should not be called in this test")),
      } as GitLabCliShape),
    ),
    Layer.provideMerge(
      Layer.succeed(GitCore, {
        execute:
          input.gitCore?.execute ??
          (() => Effect.die("GitCore.execute should not be called in this test")),
        ensureRemote:
          input.gitCore?.ensureRemote ??
          (() => Effect.die("GitCore.ensureRemote should not be called in this test")),
        statusDetails:
          input.gitCore?.statusDetails ??
          (() => Effect.die("GitCore.statusDetails should not be called in this test")),
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

  it("looks up GitLab repository clone URLs", async () => {
    const getRepositoryCloneUrls = vi.fn<GitLabCliShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://gitlab.com/${input.repository}`,
        sshUrl: `git@gitlab.com:${input.repository}.git`,
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitLabCli: { getRepositoryCloneUrls },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.lookupRepository({
          provider: "gitlab",
          repository: "group/project",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "group/project",
    });
    expect(result).toEqual({
      provider: "gitlab",
      nameWithOwner: "group/project",
      url: "https://gitlab.com/group/project",
      sshUrl: "git@gitlab.com:group/project.git",
    });
  });

  it("looks up Azure DevOps repository clone URLs", async () => {
    const getRepositoryCloneUrls = vi.fn<AzureDevOpsCliShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://dev.azure.com/acme/${input.repository.replace("/", "/_git/")}`,
        sshUrl: `git@ssh.dev.azure.com:v3/acme/${input.repository}`,
      }),
    );
    const layer = makeLayer({
      azureDevOpsCli: { getRepositoryCloneUrls },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.lookupRepository({
          provider: "azure-devops",
          repository: "project/repo",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "project/repo",
    });
    expect(result).toEqual({
      provider: "azure-devops",
      nameWithOwner: "project/repo",
      url: "https://dev.azure.com/acme/project/_git/repo",
      sshUrl: "git@ssh.dev.azure.com:v3/acme/project/repo",
    });
  });

  it("looks up Bitbucket repository clone URLs", async () => {
    const getRepositoryCloneUrls = vi.fn<BitbucketApiShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://bitbucket.org/${input.repository}.git`,
        sshUrl: `git@bitbucket.org:${input.repository}.git`,
      }),
    );
    const layer = makeLayer({
      bitbucketApi: { getRepositoryCloneUrls },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.lookupRepository({
          provider: "bitbucket",
          repository: "workspace/repo",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "workspace/repo",
    });
    expect(result).toEqual({
      provider: "bitbucket",
      nameWithOwner: "workspace/repo",
      url: "https://bitbucket.org/workspace/repo.git",
      sshUrl: "git@bitbucket.org:workspace/repo.git",
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
          provider: "unknown",
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

  it("resolves GitLab clone URLs before cloning provider repositories", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-gitlab-");
    const destinationPath = path.join(parentDir, "project");
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
      }),
    );
    const getRepositoryCloneUrls = vi.fn<GitLabCliShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://gitlab.com/${input.repository}`,
        sshUrl: `git@gitlab.com:${input.repository}.git`,
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitLabCli: { getRepositoryCloneUrls },
      gitCore: { execute },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          provider: "gitlab",
          repository: "group/project",
          destinationPath,
          protocol: "https",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: parentDir,
      repository: "group/project",
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: parentDir,
      args: ["clone", "https://gitlab.com/group/project", "project"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
    expect(result.repository).toEqual({
      provider: "gitlab",
      nameWithOwner: "group/project",
      url: "https://gitlab.com/group/project",
      sshUrl: "git@gitlab.com:group/project.git",
    });
  });

  it("resolves Azure DevOps clone URLs before cloning provider repositories", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-azure-");
    const destinationPath = path.join(parentDir, "repo");
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
      }),
    );
    const getRepositoryCloneUrls = vi.fn<AzureDevOpsCliShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://dev.azure.com/acme/${input.repository.replace("/", "/_git/")}`,
        sshUrl: `git@ssh.dev.azure.com:v3/acme/${input.repository}`,
      }),
    );
    const layer = makeLayer({
      azureDevOpsCli: { getRepositoryCloneUrls },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: { execute },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          provider: "azure-devops",
          repository: "project/repo",
          destinationPath,
          protocol: "https",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: parentDir,
      repository: "project/repo",
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: parentDir,
      args: ["clone", "https://dev.azure.com/acme/project/_git/repo", "repo"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
    expect(result.repository).toEqual({
      provider: "azure-devops",
      nameWithOwner: "project/repo",
      url: "https://dev.azure.com/acme/project/_git/repo",
      sshUrl: "git@ssh.dev.azure.com:v3/acme/project/repo",
    });
  });

  it("resolves Bitbucket clone URLs before cloning provider repositories", async () => {
    const parentDir = makeTempDir("t3code-source-control-clone-bitbucket-");
    const destinationPath = path.join(parentDir, "repo");
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
      }),
    );
    const getRepositoryCloneUrls = vi.fn<BitbucketApiShape["getRepositoryCloneUrls"]>((input) =>
      Effect.succeed({
        nameWithOwner: input.repository,
        url: `https://bitbucket.org/${input.repository}.git`,
        sshUrl: `git@bitbucket.org:${input.repository}.git`,
      }),
    );
    const layer = makeLayer({
      bitbucketApi: { getRepositoryCloneUrls },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: { execute },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.cloneRepository({
          provider: "bitbucket",
          repository: "workspace/repo",
          destinationPath,
          protocol: "https",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
      cwd: parentDir,
      repository: "workspace/repo",
    });
    expect(execute).toHaveBeenCalledWith({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: parentDir,
      args: ["clone", "https://bitbucket.org/workspace/repo.git", "repo"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
    expect(result.repository).toEqual({
      provider: "bitbucket",
      nameWithOwner: "workspace/repo",
      url: "https://bitbucket.org/workspace/repo.git",
      sshUrl: "git@bitbucket.org:workspace/repo.git",
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

  it("publishes by creating the repository, adding a remote, and pushing upstream", async () => {
    const execute = vi.fn<GitCoreShape["execute"]>((input) =>
      Effect.succeed({
        code: 0,
        stdout: input.args.includes("push") ? "pushed" : "",
        stderr: "",
      }),
    );
    const ensureRemote = vi.fn<GitCoreShape["ensureRemote"]>(() => Effect.succeed("origin"));
    const statusDetails = vi.fn<GitCoreShape["statusDetails"]>(() =>
      Effect.succeed({
        branch: "feature/source-control",
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 1,
        behindCount: 0,
        upstreamRef: null,
      }),
    );
    const createRepository = vi.fn<GitHubCliShape["createRepository"]>(() =>
      Effect.succeed({
        nameWithOwner: "octocat/hello-world",
        url: "https://github.com/octocat/hello-world",
        sshUrl: "git@github.com:octocat/hello-world.git",
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
        createRepository,
      },
      gitCore: {
        execute,
        ensureRemote,
        statusDetails,
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.publishRepository({
          cwd: "/workspace",
          provider: "github",
          repository: "octocat/hello-world",
          visibility: "private",
          remoteName: "origin",
          protocol: "ssh",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(createRepository).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "octocat/hello-world",
      visibility: "private",
    });
    expect(ensureRemote).toHaveBeenCalledWith({
      cwd: "/workspace",
      preferredName: "origin",
      url: "git@github.com:octocat/hello-world.git",
    });
    expect(execute).toHaveBeenNthCalledWith(1, {
      operation: "SourceControlRepositoryService.publishRepository.headCheck",
      cwd: "/workspace",
      args: ["rev-parse", "--verify", "HEAD"],
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      operation: "SourceControlRepositoryService.publishRepository.push",
      cwd: "/workspace",
      args: ["push", "-u", "origin", "HEAD:refs/heads/feature/source-control"],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });
    expect(result).toEqual({
      repository: {
        provider: "github",
        nameWithOwner: "octocat/hello-world",
        url: "https://github.com/octocat/hello-world",
        sshUrl: "git@github.com:octocat/hello-world.git",
      },
      remoteName: "origin",
      remoteUrl: "git@github.com:octocat/hello-world.git",
      branch: "feature/source-control",
      upstreamBranch: "origin/feature/source-control",
      status: "pushed",
    });
  });

  it("adds the publish remote without pushing empty repositories", async () => {
    const execute = vi.fn<GitCoreShape["execute"]>(() =>
      Effect.fail(
        new GitCommandError({
          operation: "SourceControlRepositoryService.publishRepository.headCheck",
          command: "git rev-parse --verify HEAD",
          cwd: "/workspace",
          detail: "no HEAD",
        }),
      ),
    );
    const ensureRemote = vi.fn<GitCoreShape["ensureRemote"]>(() => Effect.succeed("origin"));
    const statusDetails = vi.fn<GitCoreShape["statusDetails"]>(() =>
      Effect.succeed({
        branch: "main",
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        upstreamRef: null,
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
        createRepository: () =>
          Effect.succeed({
            nameWithOwner: "octocat/empty",
            url: "https://github.com/octocat/empty",
            sshUrl: "git@github.com:octocat/empty.git",
          }),
      },
      gitCore: {
        execute,
        ensureRemote,
        statusDetails,
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.publishRepository({
          cwd: "/workspace",
          provider: "github",
          repository: "octocat/empty",
          visibility: "public",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      repository: {
        provider: "github",
        nameWithOwner: "octocat/empty",
        url: "https://github.com/octocat/empty",
        sshUrl: "git@github.com:octocat/empty.git",
      },
      remoteName: "origin",
      remoteUrl: "git@github.com:octocat/empty.git",
      branch: "main",
      status: "remote_added",
    });
  });

  it("publishes GitLab repositories", async () => {
    const execute = vi.fn<GitCoreShape["execute"]>((input) =>
      Effect.succeed({
        code: 0,
        stdout: input.args.includes("push") ? "pushed" : "",
        stderr: "",
      }),
    );
    const ensureRemote = vi.fn<GitCoreShape["ensureRemote"]>(() => Effect.succeed("origin"));
    const statusDetails = vi.fn<GitCoreShape["statusDetails"]>(() =>
      Effect.succeed({
        branch: "feature/gitlab",
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 1,
        behindCount: 0,
        upstreamRef: null,
      }),
    );
    const createRepository = vi.fn<GitLabCliShape["createRepository"]>(() =>
      Effect.succeed({
        nameWithOwner: "group/project",
        url: "https://gitlab.com/group/project",
        sshUrl: "git@gitlab.com:group/project.git",
      }),
    );
    const layer = makeLayer({
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitLabCli: { createRepository },
      gitCore: {
        execute,
        ensureRemote,
        statusDetails,
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.publishRepository({
          cwd: "/workspace",
          provider: "gitlab",
          repository: "group/project",
          visibility: "private",
          protocol: "ssh",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(createRepository).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "group/project",
      visibility: "private",
    });
    expect(ensureRemote).toHaveBeenCalledWith({
      cwd: "/workspace",
      preferredName: "origin",
      url: "git@gitlab.com:group/project.git",
    });
    expect(result).toEqual({
      repository: {
        provider: "gitlab",
        nameWithOwner: "group/project",
        url: "https://gitlab.com/group/project",
        sshUrl: "git@gitlab.com:group/project.git",
      },
      remoteName: "origin",
      remoteUrl: "git@gitlab.com:group/project.git",
      branch: "feature/gitlab",
      upstreamBranch: "origin/feature/gitlab",
      status: "pushed",
    });
  });

  it("publishes Azure DevOps repositories", async () => {
    const execute = vi.fn<GitCoreShape["execute"]>((input) =>
      Effect.succeed({
        code: 0,
        stdout: input.args.includes("push") ? "pushed" : "",
        stderr: "",
      }),
    );
    const ensureRemote = vi.fn<GitCoreShape["ensureRemote"]>(() => Effect.succeed("origin"));
    const statusDetails = vi.fn<GitCoreShape["statusDetails"]>(() =>
      Effect.succeed({
        branch: "feature/azure",
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 1,
        behindCount: 0,
        upstreamRef: null,
      }),
    );
    const createRepository = vi.fn<AzureDevOpsCliShape["createRepository"]>(() =>
      Effect.succeed({
        nameWithOwner: "project/repo",
        url: "https://dev.azure.com/acme/project/_git/repo",
        sshUrl: "git@ssh.dev.azure.com:v3/acme/project/repo",
      }),
    );
    const layer = makeLayer({
      azureDevOpsCli: { createRepository },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: {
        execute,
        ensureRemote,
        statusDetails,
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.publishRepository({
          cwd: "/workspace",
          provider: "azure-devops",
          repository: "project/repo",
          visibility: "private",
          protocol: "ssh",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(createRepository).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "project/repo",
      visibility: "private",
    });
    expect(ensureRemote).toHaveBeenCalledWith({
      cwd: "/workspace",
      preferredName: "origin",
      url: "git@ssh.dev.azure.com:v3/acme/project/repo",
    });
    expect(result).toEqual({
      repository: {
        provider: "azure-devops",
        nameWithOwner: "project/repo",
        url: "https://dev.azure.com/acme/project/_git/repo",
        sshUrl: "git@ssh.dev.azure.com:v3/acme/project/repo",
      },
      remoteName: "origin",
      remoteUrl: "git@ssh.dev.azure.com:v3/acme/project/repo",
      branch: "feature/azure",
      upstreamBranch: "origin/feature/azure",
      status: "pushed",
    });
  });

  it("publishes Bitbucket repositories", async () => {
    const execute = vi.fn<GitCoreShape["execute"]>((input) =>
      Effect.succeed({
        code: 0,
        stdout: input.args.includes("push") ? "pushed" : "",
        stderr: "",
      }),
    );
    const ensureRemote = vi.fn<GitCoreShape["ensureRemote"]>(() => Effect.succeed("origin"));
    const statusDetails = vi.fn<GitCoreShape["statusDetails"]>(() =>
      Effect.succeed({
        branch: "feature/bitbucket",
        hasWorkingTreeChanges: false,
        workingTree: {
          files: [],
          insertions: 0,
          deletions: 0,
        },
        hasUpstream: false,
        aheadCount: 1,
        behindCount: 0,
        upstreamRef: null,
      }),
    );
    const createRepository = vi.fn<BitbucketApiShape["createRepository"]>(() =>
      Effect.succeed({
        nameWithOwner: "workspace/repo",
        url: "https://bitbucket.org/workspace/repo.git",
        sshUrl: "git@bitbucket.org:workspace/repo.git",
      }),
    );
    const layer = makeLayer({
      bitbucketApi: { createRepository },
      gitHubCli: {
        getRepositoryCloneUrls: () => Effect.die("GitHubCli should not be called"),
      },
      gitCore: {
        execute,
        ensureRemote,
        statusDetails,
      },
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SourceControlRepositoryService;
        return yield* service.publishRepository({
          cwd: "/workspace",
          provider: "bitbucket",
          repository: "workspace/repo",
          visibility: "private",
          protocol: "ssh",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(createRepository).toHaveBeenCalledWith({
      cwd: "/workspace",
      repository: "workspace/repo",
      visibility: "private",
    });
    expect(ensureRemote).toHaveBeenCalledWith({
      cwd: "/workspace",
      preferredName: "origin",
      url: "git@bitbucket.org:workspace/repo.git",
    });
    expect(result).toEqual({
      repository: {
        provider: "bitbucket",
        nameWithOwner: "workspace/repo",
        url: "https://bitbucket.org/workspace/repo.git",
        sshUrl: "git@bitbucket.org:workspace/repo.git",
      },
      remoteName: "origin",
      remoteUrl: "git@bitbucket.org:workspace/repo.git",
      branch: "feature/bitbucket",
      upstreamBranch: "origin/feature/bitbucket",
      status: "pushed",
    });
  });
});

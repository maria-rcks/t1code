import * as NodeOS from "node:os";
import {
  type SourceControlCloneProtocol,
  type SourceControlCloneRepositoryInput,
  type SourceControlCloneRepositoryResult,
  type SourceControlPublishRepositoryInput,
  type SourceControlPublishRepositoryResult,
  SourceControlRepositoryError,
  type SourceControlProviderKind,
  type SourceControlRepositoryInfo,
  type SourceControlRepositoryLookupInput,
} from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path, Schema, ServiceMap } from "effect";

import { ServerConfig } from "../config";
import { GitCore } from "../git/Services/GitCore";
import { GitHubCli } from "../git/Services/GitHubCli";

const isSourceControlRepositoryError = Schema.is(SourceControlRepositoryError);

export interface SourceControlRepositoryServiceShape {
  readonly lookupRepository: (
    input: SourceControlRepositoryLookupInput,
  ) => Effect.Effect<SourceControlRepositoryInfo, SourceControlRepositoryError>;
  readonly cloneRepository: (
    input: SourceControlCloneRepositoryInput,
  ) => Effect.Effect<SourceControlCloneRepositoryResult, SourceControlRepositoryError>;
  readonly publishRepository: (
    input: SourceControlPublishRepositoryInput,
  ) => Effect.Effect<SourceControlPublishRepositoryResult, SourceControlRepositoryError>;
}

export class SourceControlRepositoryService extends ServiceMap.Service<
  SourceControlRepositoryService,
  SourceControlRepositoryServiceShape
>()("t3/sourceControl/SourceControlRepositoryService") {}

function detailFromUnknown(cause: unknown): string {
  if (cause && typeof cause === "object") {
    if ("detail" in cause && typeof cause.detail === "string" && cause.detail.length > 0) {
      return cause.detail;
    }
    if ("message" in cause && typeof cause.message === "string" && cause.message.length > 0) {
      return cause.message;
    }
  }
  return "An unexpected source control repository error occurred.";
}

function repositoryError(input: {
  readonly operation: string;
  readonly provider: SourceControlProviderKind;
  readonly detail: string;
  readonly cause?: unknown;
}): SourceControlRepositoryError {
  return new SourceControlRepositoryError({
    operation: input.operation,
    provider: input.provider,
    detail: input.detail,
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  });
}

function mapRepositoryError(operation: string, provider: SourceControlProviderKind) {
  return Effect.mapError((cause: unknown) =>
    isSourceControlRepositoryError(cause)
      ? cause
      : repositoryError({
          operation,
          provider,
          detail: detailFromUnknown(cause),
          cause,
        }),
  );
}

function unsupportedProvider(provider: SourceControlProviderKind, operation: string) {
  return repositoryError({
    operation,
    provider,
    detail: `Repository ${operation} is currently supported for GitHub only.`,
  });
}

function selectRemoteUrl(
  urls: SourceControlRepositoryInfo,
  protocol: SourceControlCloneProtocol | undefined,
): string {
  switch (protocol ?? "auto") {
    case "https":
      return urls.url;
    case "auto":
    case "ssh":
      return urls.sshUrl;
  }
}

function expandHomePath(input: string, path: Path.Path): string {
  if (input === "~") {
    return NodeOS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(NodeOS.homedir(), input.slice(2));
  }
  return input;
}

export const make = Effect.fn("makeSourceControlRepositoryService")(function* () {
  const config = yield* ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const git = yield* GitCore;
  const gitHubCli = yield* GitHubCli;
  const path = yield* Path.Path;

  const lookupRepository = Effect.fn("SourceControlRepositoryService.lookupRepository")(function* (
    input: SourceControlRepositoryLookupInput,
  ) {
    if (input.provider !== "github") {
      return yield* unsupportedProvider(input.provider, "lookup");
    }

    const repository = input.repository.trim();
    const urls = yield* gitHubCli.getRepositoryCloneUrls({
      cwd: input.cwd ?? config.cwd,
      repository,
    });

    return {
      provider: "github",
      nameWithOwner: urls.nameWithOwner,
      url: urls.url,
      sshUrl: urls.sshUrl,
    } satisfies SourceControlRepositoryInfo;
  });

  const normalizeDestinationPath = Effect.fn("SourceControlRepositoryService.normalizeDestination")(
    function* (destinationPath: string) {
      const trimmed = destinationPath.trim();
      if (trimmed.length === 0) {
        return yield* repositoryError({
          operation: "cloneRepository",
          provider: "unknown",
          detail: "Choose a destination path before cloning.",
        });
      }

      return path.resolve(expandHomePath(trimmed, path));
    },
  );

  const prepareDestination = Effect.fn("SourceControlRepositoryService.prepareDestination")(
    function* (destinationPath: string) {
      const normalizedDestination = yield* normalizeDestinationPath(destinationPath);
      const exists = yield* fileSystem
        .exists(normalizedDestination)
        .pipe(Effect.orElseSucceed(() => false));
      if (exists) {
        const entries = yield* fileSystem
          .readDirectory(normalizedDestination, { recursive: false })
          .pipe(
            Effect.mapError((cause) =>
              repositoryError({
                operation: "cloneRepository",
                provider: "unknown",
                detail: "Destination path already exists and is not a directory.",
                cause,
              }),
            ),
          );
        if (entries.length > 0) {
          return yield* repositoryError({
            operation: "cloneRepository",
            provider: "unknown",
            detail: "Destination path already exists and is not empty.",
          });
        }
      } else {
        yield* fileSystem.makeDirectory(path.dirname(normalizedDestination), { recursive: true });
      }

      return {
        destinationPath: normalizedDestination,
        parentPath: path.dirname(normalizedDestination),
        directoryName: path.basename(normalizedDestination),
      };
    },
  );

  const cloneRepository = Effect.fn("SourceControlRepositoryService.cloneRepository")(function* (
    input: SourceControlCloneRepositoryInput,
  ) {
    const preparedDestination = yield* prepareDestination(input.destinationPath);
    let repository: SourceControlRepositoryInfo | null = null;
    let remoteUrl = input.remoteUrl?.trim() ?? null;
    let provider: SourceControlProviderKind = input.provider ?? "unknown";

    if (input.provider && input.repository) {
      repository = yield* lookupRepository({
        provider: input.provider,
        repository: input.repository,
        cwd: preparedDestination.parentPath,
      });
      remoteUrl = selectRemoteUrl(repository, input.protocol);
      provider = input.provider;
    }

    if (!remoteUrl) {
      return yield* repositoryError({
        operation: "cloneRepository",
        provider,
        detail: "Enter a repository path or clone URL before cloning.",
      });
    }

    yield* git.execute({
      operation: "SourceControlRepositoryService.cloneRepository",
      cwd: preparedDestination.parentPath,
      args: ["clone", remoteUrl, preparedDestination.directoryName],
      timeoutMs: 120_000,
      maxOutputBytes: 256 * 1024,
    });

    return {
      cwd: preparedDestination.destinationPath,
      remoteUrl,
      repository,
    } satisfies SourceControlCloneRepositoryResult;
  });

  const publishRepository = Effect.fn("SourceControlRepositoryService.publishRepository")(
    function* (input: SourceControlPublishRepositoryInput) {
      if (input.provider !== "github") {
        return yield* unsupportedProvider(input.provider, "publish");
      }

      const urls = yield* gitHubCli.createRepository({
        cwd: input.cwd,
        repository: input.repository.trim(),
        visibility: input.visibility,
      });
      const repository = {
        provider: "github",
        nameWithOwner: urls.nameWithOwner,
        url: urls.url,
        sshUrl: urls.sshUrl,
      } satisfies SourceControlRepositoryInfo;
      const remoteUrl = selectRemoteUrl(repository, input.protocol);
      const remoteName = yield* git.ensureRemote({
        cwd: input.cwd,
        preferredName: input.remoteName?.trim() || "origin",
        url: remoteUrl,
      });

      const hasCommits = yield* git
        .execute({
          operation: "SourceControlRepositoryService.publishRepository.headCheck",
          cwd: input.cwd,
          args: ["rev-parse", "--verify", "HEAD"],
        })
        .pipe(
          Effect.map(() => true),
          Effect.catch(() => Effect.succeed(false)),
        );
      const details = yield* git
        .statusDetails(input.cwd)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      const branch = details?.branch ?? "main";

      if (!hasCommits) {
        return {
          repository,
          remoteName,
          remoteUrl,
          branch,
          status: "remote_added" as const,
        } satisfies SourceControlPublishRepositoryResult;
      }

      yield* git.execute({
        operation: "SourceControlRepositoryService.publishRepository.push",
        cwd: input.cwd,
        args: ["push", "-u", remoteName, `HEAD:refs/heads/${branch}`],
        timeoutMs: 120_000,
        maxOutputBytes: 256 * 1024,
      });

      return {
        repository,
        remoteName,
        remoteUrl,
        branch,
        upstreamBranch: `${remoteName}/${branch}`,
        status: "pushed" as const,
      } satisfies SourceControlPublishRepositoryResult;
    },
  );

  return SourceControlRepositoryService.of({
    lookupRepository: (input) =>
      lookupRepository(input).pipe(mapRepositoryError("lookupRepository", input.provider)),
    cloneRepository: (input) =>
      cloneRepository(input).pipe(
        mapRepositoryError("cloneRepository", input.provider ?? "unknown"),
      ),
    publishRepository: (input) =>
      publishRepository(input).pipe(mapRepositoryError("publishRepository", input.provider)),
  });
});

export const SourceControlRepositoryServiceLive = Layer.effect(
  SourceControlRepositoryService,
  make(),
);

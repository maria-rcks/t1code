import {
  SourceControlRepositoryError,
  type SourceControlProviderKind,
  type SourceControlRepositoryInfo,
  type SourceControlRepositoryLookupInput,
} from "@t3tools/contracts";
import { Effect, Layer, Schema, ServiceMap } from "effect";

import { ServerConfig } from "../config";
import { GitHubCli } from "../git/Services/GitHubCli";

const isSourceControlRepositoryError = Schema.is(SourceControlRepositoryError);

export interface SourceControlRepositoryServiceShape {
  readonly lookupRepository: (
    input: SourceControlRepositoryLookupInput,
  ) => Effect.Effect<SourceControlRepositoryInfo, SourceControlRepositoryError>;
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

export const make = Effect.fn("makeSourceControlRepositoryService")(function* () {
  const config = yield* ServerConfig;
  const gitHubCli = yield* GitHubCli;

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

  return SourceControlRepositoryService.of({
    lookupRepository: (input) =>
      lookupRepository(input).pipe(mapRepositoryError("lookupRepository", input.provider)),
  });
});

export const SourceControlRepositoryServiceLive = Layer.effect(
  SourceControlRepositoryService,
  make(),
);

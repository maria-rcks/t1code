import { Effect, Layer, Schema } from "effect";
import { TrimmedNonEmptyString } from "@t3tools/contracts";

import { runProcess } from "../../processRunner";
import { AzureDevOpsCliError } from "../Errors";
import {
  AzureDevOpsCli,
  type AzureDevOpsCliShape,
  type AzureDevOpsRepositoryCloneUrls,
} from "../Services/AzureDevOpsCli";

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeAzureDevOpsCliError(
  operation: "execute" | "stdout",
  error: unknown,
): AzureDevOpsCliError {
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (error.message.includes("Command not found: az") || lower.includes("enoent")) {
      return new AzureDevOpsCliError({
        operation,
        detail: "Azure CLI (`az`) is required but not available on PATH.",
        cause: error,
      });
    }

    if (
      lower.includes("az login") ||
      lower.includes("not logged in") ||
      lower.includes("authentication failed")
    ) {
      return new AzureDevOpsCliError({
        operation,
        detail: "Azure CLI is not authenticated. Run `az login` and retry.",
        cause: error,
      });
    }

    if (lower.includes("azure devops extension")) {
      return new AzureDevOpsCliError({
        operation,
        detail:
          "Azure DevOps CLI extension is required. Run `az extension add --name azure-devops`.",
        cause: error,
      });
    }

    return new AzureDevOpsCliError({
      operation,
      detail: `Azure DevOps CLI command failed: ${error.message}`,
      cause: error,
    });
  }

  return new AzureDevOpsCliError({
    operation,
    detail: "Azure DevOps CLI command failed.",
    cause: error,
  });
}

const RawAzureDevOpsRepositorySchema = Schema.Struct({
  name: TrimmedNonEmptyString,
  webUrl: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
  sshUrl: TrimmedNonEmptyString,
  project: Schema.optional(
    Schema.Struct({
      name: TrimmedNonEmptyString,
    }),
  ),
});

function normalizeRepositoryCloneUrls(
  raw: Schema.Schema.Type<typeof RawAzureDevOpsRepositorySchema>,
): AzureDevOpsRepositoryCloneUrls {
  const projectName = raw.project?.name.trim();
  return {
    nameWithOwner: projectName ? `${projectName}/${raw.name}` : raw.name,
    url: raw.remoteUrl,
    sshUrl: raw.sshUrl,
  };
}

function parseRepositorySpecifier(repository: string): {
  readonly project: string | null;
  readonly name: string;
} {
  const parts = repository
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return {
    project: parts.length > 1 ? (parts.at(-2) ?? null) : null,
    name: parts.at(-1) ?? repository.trim(),
  };
}

function decodeAzureDevOpsJson<S extends Schema.Top>(
  raw: string,
  schema: S,
  operation: "getRepositoryCloneUrls" | "createRepository",
  invalidDetail: string,
): Effect.Effect<S["Type"], AzureDevOpsCliError, S["DecodingServices"]> {
  return Schema.decodeEffect(Schema.fromJsonString(schema))(raw).pipe(
    Effect.mapError(
      (error) =>
        new AzureDevOpsCliError({
          operation,
          detail: error instanceof Error ? `${invalidDetail}: ${error.message}` : invalidDetail,
          cause: error,
        }),
    ),
  );
}

const makeAzureDevOpsCli = Effect.sync(() => {
  const execute: AzureDevOpsCliShape["execute"] = (input) =>
    Effect.tryPromise({
      try: () =>
        runProcess("az", input.args, {
          cwd: input.cwd,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        }),
      catch: (error) => normalizeAzureDevOpsCliError("execute", error),
    });

  const executeJson = (input: Parameters<AzureDevOpsCliShape["execute"]>[0]) =>
    execute({
      ...input,
      args: [...input.args, "--only-show-errors", "--output", "json"],
    });

  return {
    execute,
    getRepositoryCloneUrls: (input) =>
      executeJson({
        cwd: input.cwd,
        args: ["repos", "show", "--detect", "true", "--repository", input.repository],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          decodeAzureDevOpsJson(
            raw,
            RawAzureDevOpsRepositorySchema,
            "getRepositoryCloneUrls",
            "Azure DevOps CLI returned invalid repository JSON.",
          ),
        ),
        Effect.map(normalizeRepositoryCloneUrls),
      ),
    createRepository: (input) => {
      const repository = parseRepositorySpecifier(input.repository);
      return executeJson({
        cwd: input.cwd,
        args: [
          "repos",
          "create",
          "--detect",
          "true",
          "--name",
          repository.name,
          ...(repository.project ? ["--project", repository.project] : []),
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          decodeAzureDevOpsJson(
            raw,
            RawAzureDevOpsRepositorySchema,
            "createRepository",
            "Azure DevOps CLI returned invalid repository JSON.",
          ),
        ),
        Effect.map(normalizeRepositoryCloneUrls),
      );
    },
  } satisfies AzureDevOpsCliShape;
});

export const AzureDevOpsCliLive = Layer.effect(AzureDevOpsCli, makeAzureDevOpsCli);

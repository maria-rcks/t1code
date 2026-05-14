import type {
  SourceControlDiscoveryResult,
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
  SourceControlProviderKind,
  VcsDiscoveryItem,
  VcsDriverKind,
} from "@t3tools/contracts";
import { Effect, Layer, Schema, ServiceMap } from "effect";

import { runProcess, type ProcessRunResult } from "../processRunner";

interface SourceControlAuthProbeInput {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: ProcessRunResult["code"];
}

interface CliDiscoverySpecBase {
  readonly label: string;
  readonly executable: string;
  readonly versionArgs: ReadonlyArray<string>;
  readonly installHint: string;
}

interface VcsCliDiscoverySpec extends CliDiscoverySpecBase {
  readonly kind: VcsDriverKind;
  readonly implemented: boolean;
}

interface ProviderCliDiscoverySpec extends CliDiscoverySpecBase {
  readonly kind: SourceControlProviderKind;
  readonly authArgs: ReadonlyArray<string>;
  readonly parseAuth: (input: SourceControlAuthProbeInput) => SourceControlProviderAuth;
}

export interface SourceControlDiscoveryShape {
  readonly discover: (input?: {
    readonly cwd?: string;
  }) => Effect.Effect<SourceControlDiscoveryResult>;
}

export class SourceControlDiscovery extends ServiceMap.Service<
  SourceControlDiscovery,
  SourceControlDiscoveryShape
>()("t3/sourceControl/SourceControlDiscovery") {}

class SourceControlDiscoveryError extends Schema.TaggedErrorClass<SourceControlDiscoveryError>()(
  "SourceControlDiscoveryError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

const GIT_SPEC: VcsCliDiscoverySpec = {
  kind: "git",
  implemented: true,
  label: "Git",
  executable: "git",
  versionArgs: ["--version"],
  installHint: "Install Git and make sure `git` is available on PATH.",
};

const PROVIDER_SPECS: ReadonlyArray<ProviderCliDiscoverySpec> = [
  {
    kind: "github",
    label: "GitHub",
    executable: "gh",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    installHint: "Install GitHub CLI and run `gh auth login`.",
    parseAuth: parseGitHubAuth,
  },
  {
    kind: "gitlab",
    label: "GitLab",
    executable: "glab",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    installHint: "Install GitLab CLI and run `glab auth login`.",
    parseAuth: parseGitLabAuth,
  },
  {
    kind: "azure-devops",
    label: "Azure DevOps",
    executable: "az",
    versionArgs: ["--version"],
    authArgs: ["account", "show", "--query", "user.name", "--output", "tsv"],
    installHint: "Install Azure CLI, install the Azure DevOps extension, and run `az login`.",
    parseAuth: parseAzureAuth,
  },
];

function firstNonEmptyLine(text: string): string | null {
  return (
    text
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? null
  );
}

function errorDetail(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return null;
}

function normalizeProcessError(operation: string, error: unknown): SourceControlDiscoveryError {
  return new SourceControlDiscoveryError({
    operation,
    detail: errorDetail(error) ?? `Failed to run ${operation}.`,
    cause: error,
  });
}

function auth(input: {
  readonly status: SourceControlProviderAuth["status"];
  readonly account?: string | null | undefined;
  readonly host?: string | null | undefined;
  readonly detail?: string | null | undefined;
}): SourceControlProviderAuth {
  return {
    status: input.status,
    account: normalizeText(input.account),
    host: normalizeText(input.host),
    detail: normalizeText(input.detail),
  };
}

function unknownAuth(detail?: string | null): SourceControlProviderAuth {
  return auth({ status: "unknown", detail });
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function combinedOutput(input: SourceControlAuthProbeInput): string {
  return [input.stdout, input.stderr].filter((entry) => entry.trim().length > 0).join("\n");
}

function sanitizedAuthLines(text: string): ReadonlyArray<string> {
  return text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => !/^[-\s]*token(?:\s+scopes?)?:/iu.test(entry));
}

function firstSafeAuthLine(text: string): string | undefined {
  return sanitizedAuthLines(text)[0];
}

function parseCliHost(text: string): string | undefined {
  return sanitizedAuthLines(text)
    .map((line) => line.replace(/^[^a-z0-9]+/iu, ""))
    .find((line) => /^[a-z0-9][a-z0-9.-]*(?::\d+)?$/iu.test(line));
}

function matchFirst(text: string, patterns: ReadonlyArray<RegExp>): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function parseGitHubAuth(input: SourceControlAuthProbeInput): SourceControlProviderAuth {
  const text = combinedOutput(input);
  const lower = text.toLowerCase();
  if (
    input.code !== 0 ||
    lower.includes("not logged") ||
    lower.includes("failed to authenticate")
  ) {
    return auth({ status: "unauthenticated", detail: firstSafeAuthLine(text) });
  }
  return auth({
    status: "authenticated",
    account: matchFirst(text, [/Logged in to .+ account ([^()\s]+)/iu, /account ([^()\s]+)/iu]),
    host: parseCliHost(text),
    detail: firstSafeAuthLine(text),
  });
}

export function parseGitLabAuth(input: SourceControlAuthProbeInput): SourceControlProviderAuth {
  const text = combinedOutput(input);
  const lower = text.toLowerCase();
  if (input.code !== 0 || lower.includes("not logged") || lower.includes("no token")) {
    return auth({ status: "unauthenticated", detail: firstSafeAuthLine(text) });
  }
  return auth({
    status: "authenticated",
    account: matchFirst(text, [/Logged in to .+ as ([^\s]+)/iu, /as ([^\s]+)/iu]),
    host: parseCliHost(text),
    detail: firstSafeAuthLine(text),
  });
}

export function parseAzureAuth(input: SourceControlAuthProbeInput): SourceControlProviderAuth {
  const text = combinedOutput(input);
  const account = firstNonEmptyLine(input.stdout);
  if (input.code === 0 && account) {
    return auth({
      status: "authenticated",
      account,
      host: "dev.azure.com",
      detail: "Azure CLI account is active.",
    });
  }
  return auth({
    status: "unauthenticated",
    detail: firstSafeAuthLine(text) ?? "Azure CLI is not authenticated.",
  });
}

function probeVersion(input: {
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
}): Effect.Effect<{
  readonly status: "available" | "missing";
  readonly version: string | null;
  readonly detail: string | null;
}> {
  return Effect.tryPromise({
    try: () =>
      runProcess(input.executable, input.args, {
        cwd: input.cwd,
        timeoutMs: 5_000,
        maxBufferBytes: 8_000,
        outputMode: "truncate",
      }),
    catch: (error) => normalizeProcessError(`${input.executable} ${input.args.join(" ")}`, error),
  }).pipe(
    Effect.map((result) => ({
      status: "available" as const,
      version: firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr),
      detail:
        result.stdoutTruncated || result.stderrTruncated ? "Version output was truncated." : null,
    })),
    Effect.catch((error) =>
      Effect.succeed({
        status: "missing" as const,
        version: null,
        detail: errorDetail(error),
      }),
    ),
  );
}

function discoverVcs(input: {
  readonly spec: VcsCliDiscoverySpec;
  readonly cwd: string;
}): Effect.Effect<VcsDiscoveryItem> {
  return probeVersion({
    executable: input.spec.executable,
    args: input.spec.versionArgs,
    cwd: input.cwd,
  }).pipe(
    Effect.map((result) => ({
      kind: input.spec.kind,
      implemented: input.spec.implemented,
      label: input.spec.label,
      executable: input.spec.executable,
      status: result.status,
      version: result.version,
      installHint: input.spec.installHint,
      detail: result.detail,
    })),
  );
}

function discoverProvider(input: {
  readonly spec: ProviderCliDiscoverySpec;
  readonly cwd: string;
}): Effect.Effect<SourceControlProviderDiscoveryItem> {
  return probeVersion({
    executable: input.spec.executable,
    args: input.spec.versionArgs,
    cwd: input.cwd,
  }).pipe(
    Effect.flatMap((result) => {
      if (result.status === "missing") {
        return Effect.succeed({
          kind: input.spec.kind,
          label: input.spec.label,
          executable: input.spec.executable,
          status: result.status,
          version: result.version,
          installHint: input.spec.installHint,
          detail: result.detail,
          auth: unknownAuth("Hosting integration command was not found on the server PATH."),
        });
      }

      return Effect.tryPromise({
        try: () =>
          runProcess(input.spec.executable, input.spec.authArgs, {
            cwd: input.cwd,
            allowNonZeroExit: true,
            timeoutMs: 5_000,
            maxBufferBytes: 8_000,
            outputMode: "truncate",
          }),
        catch: (error) =>
          normalizeProcessError(`${input.spec.executable} ${input.spec.authArgs.join(" ")}`, error),
      }).pipe(
        Effect.map((authProbe) => ({
          kind: input.spec.kind,
          label: input.spec.label,
          executable: input.spec.executable,
          status: result.status,
          version: result.version,
          installHint: input.spec.installHint,
          detail: result.detail,
          auth: input.spec.parseAuth(authProbe),
        })),
        Effect.catch((error) =>
          Effect.succeed({
            kind: input.spec.kind,
            label: input.spec.label,
            executable: input.spec.executable,
            status: result.status,
            version: result.version,
            installHint: input.spec.installHint,
            detail: result.detail,
            auth: unknownAuth(errorDetail(error)),
          }),
        ),
      );
    }),
  );
}

export const layer = Layer.succeed(SourceControlDiscovery, {
  discover: (input) => {
    const cwd = input?.cwd ?? process.cwd();
    return Effect.all({
      versionControlSystems: Effect.all([discoverVcs({ spec: GIT_SPEC, cwd })], {
        concurrency: "unbounded",
      }),
      sourceControlProviders: Effect.all(
        PROVIDER_SPECS.map((spec) => discoverProvider({ spec, cwd })),
        { concurrency: "unbounded" },
      ),
    });
  },
} satisfies SourceControlDiscoveryShape);

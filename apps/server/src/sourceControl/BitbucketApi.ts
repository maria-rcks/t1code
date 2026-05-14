import { Buffer } from "node:buffer";
import { Config, Effect, Layer, Option, Schema, ServiceMap } from "effect";
import { TrimmedNonEmptyString, type SourceControlRepositoryVisibility } from "@t3tools/contracts";

const DEFAULT_API_BASE_URL = "https://api.bitbucket.org/2.0";

const BitbucketApiEnvConfig = Config.all({
  baseUrl: Config.string("T3CODE_BITBUCKET_API_BASE_URL").pipe(
    Config.withDefault(DEFAULT_API_BASE_URL),
  ),
  accessToken: Config.string("T3CODE_BITBUCKET_ACCESS_TOKEN").pipe(Config.option),
  email: Config.string("T3CODE_BITBUCKET_EMAIL").pipe(Config.option),
  apiToken: Config.string("T3CODE_BITBUCKET_API_TOKEN").pipe(Config.option),
});

export class BitbucketApiError extends Schema.TaggedErrorClass<BitbucketApiError>()(
  "BitbucketApiError",
  {
    operation: Schema.String,
    detail: Schema.String,
    status: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Bitbucket API failed in ${this.operation}: ${this.detail}`;
  }
}
const isBitbucketApiError = Schema.is(BitbucketApiError);

export interface BitbucketRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export interface BitbucketApiShape {
  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly repository: string;
  }) => Effect.Effect<BitbucketRepositoryCloneUrls, BitbucketApiError>;

  readonly createRepository: (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly visibility: SourceControlRepositoryVisibility;
  }) => Effect.Effect<BitbucketRepositoryCloneUrls, BitbucketApiError>;
}

export class BitbucketApi extends ServiceMap.Service<BitbucketApi, BitbucketApiShape>()(
  "t3/sourceControl/BitbucketApi",
) {}

const RawBitbucketRepositorySchema = Schema.Struct({
  full_name: TrimmedNonEmptyString,
  links: Schema.Struct({
    html: Schema.optional(
      Schema.Struct({
        href: TrimmedNonEmptyString,
      }),
    ),
    clone: Schema.optional(
      Schema.Array(
        Schema.Struct({
          name: TrimmedNonEmptyString,
          href: TrimmedNonEmptyString,
        }),
      ),
    ),
  }),
});

interface BitbucketRepositoryLocator {
  readonly workspace: string;
  readonly repoSlug: string;
}

function parseBitbucketRepositorySlug(value: string): BitbucketRepositoryLocator | null {
  const normalized = value.trim().replace(/\.git$/iu, "");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  const workspace = parts.at(-2);
  const repoSlug = parts.at(-1);
  return workspace && repoSlug ? { workspace, repoSlug } : null;
}

function requireRepositoryLocator(
  operation: string,
  repository: string,
): Effect.Effect<BitbucketRepositoryLocator, BitbucketApiError> {
  const locator = parseBitbucketRepositorySlug(repository);
  return locator
    ? Effect.succeed(locator)
    : Effect.fail(
        new BitbucketApiError({
          operation,
          detail: "Bitbucket repositories must be specified as workspace/repository.",
        }),
      );
}

function normalizeRepositoryCloneUrls(
  raw: typeof RawBitbucketRepositorySchema.Type,
): BitbucketRepositoryCloneUrls {
  const httpClone =
    raw.links.clone?.find((entry) => entry.name.toLowerCase() === "https")?.href ??
    raw.links.html?.href;
  const sshClone = raw.links.clone?.find((entry) => entry.name.toLowerCase() === "ssh")?.href;

  return {
    nameWithOwner: raw.full_name,
    url: httpClone ?? raw.links.html?.href ?? raw.full_name,
    sshUrl: sshClone ?? httpClone ?? raw.full_name,
  };
}

function requestError(operation: string, cause: unknown): BitbucketApiError {
  return new BitbucketApiError({
    operation,
    detail: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function responseError(operation: string, response: Response, body: string): BitbucketApiError {
  const trimmedBody = body.trim();
  return new BitbucketApiError({
    operation,
    status: response.status,
    detail:
      trimmedBody.length > 0
        ? `Bitbucket returned HTTP ${response.status}: ${trimmedBody}`
        : `Bitbucket returned HTTP ${response.status}.`,
  });
}

export const make = Effect.fn("makeBitbucketApi")(function* () {
  const config = yield* BitbucketApiEnvConfig;
  const baseUrl = config.baseUrl.replace(/\/+$/u, "");

  const authHeader = () => {
    if (Option.isSome(config.accessToken)) {
      return `Bearer ${config.accessToken.value}`;
    }
    if (Option.isSome(config.email) && Option.isSome(config.apiToken)) {
      return `Basic ${Buffer.from(`${config.email.value}:${config.apiToken.value}`).toString(
        "base64",
      )}`;
    }
    return null;
  };

  const executeJson = <S extends Schema.Top>(
    operation: string,
    path: string,
    schema: S,
    init?: RequestInit,
  ): Effect.Effect<S["Type"], BitbucketApiError, S["DecodingServices"]> => {
    const rawJson: Effect.Effect<unknown, BitbucketApiError> = Effect.tryPromise({
      try: async () => {
        const headers = new Headers(init?.headers);
        headers.set("accept", "application/json");
        const authorization = authHeader();
        if (authorization) {
          headers.set("authorization", authorization);
        }

        const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
        const body = await response.text();
        if (!response.ok) {
          throw responseError(operation, response, body);
        }

        try {
          return JSON.parse(body) as unknown;
        } catch (cause) {
          throw new BitbucketApiError({
            operation,
            detail: "Bitbucket returned invalid JSON for the requested resource.",
            cause,
          });
        }
      },
      catch: (cause) => (isBitbucketApiError(cause) ? cause : requestError(operation, cause)),
    });

    return rawJson.pipe(
      Effect.flatMap((json) =>
        Schema.decodeUnknownEffect(schema)(json).pipe(
          Effect.mapError(
            (cause) =>
              new BitbucketApiError({
                operation,
                detail: "Bitbucket returned invalid JSON for the requested resource.",
                cause,
              }),
          ),
        ),
      ),
    );
  };

  const getRepository = (operation: string, repository: string) =>
    requireRepositoryLocator(operation, repository).pipe(
      Effect.flatMap((locator) =>
        executeJson(
          operation,
          `/repositories/${encodeURIComponent(locator.workspace)}/${encodeURIComponent(
            locator.repoSlug,
          )}`,
          RawBitbucketRepositorySchema,
        ),
      ),
    );

  return BitbucketApi.of({
    getRepositoryCloneUrls: (input) =>
      getRepository("getRepositoryCloneUrls", input.repository).pipe(
        Effect.map(normalizeRepositoryCloneUrls),
      ),
    createRepository: (input) =>
      requireRepositoryLocator("createRepository", input.repository).pipe(
        Effect.flatMap((locator) =>
          executeJson(
            "createRepository",
            `/repositories/${encodeURIComponent(locator.workspace)}/${encodeURIComponent(
              locator.repoSlug,
            )}`,
            RawBitbucketRepositorySchema,
            {
              method: "POST",
              body: JSON.stringify({
                scm: "git",
                is_private: input.visibility === "private",
              }),
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        ),
        Effect.map(normalizeRepositoryCloneUrls),
      ),
  } satisfies BitbucketApiShape);
});

export const BitbucketApiLive = Layer.effect(BitbucketApi, make());

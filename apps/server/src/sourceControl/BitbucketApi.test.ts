import { Buffer } from "node:buffer";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BitbucketApi, BitbucketApiError, make } from "./BitbucketApi";

const originalEnv = { ...process.env };

function clearBitbucketEnv() {
  delete process.env.T3CODE_BITBUCKET_API_BASE_URL;
  delete process.env.T3CODE_BITBUCKET_ACCESS_TOKEN;
  delete process.env.T3CODE_BITBUCKET_EMAIL;
  delete process.env.T3CODE_BITBUCKET_API_TOKEN;
}

beforeEach(() => {
  clearBitbucketEnv();
});

afterEach(() => {
  process.env = { ...originalEnv };
  clearBitbucketEnv();
  vi.unstubAllGlobals();
});

function repositoryResponse() {
  return {
    full_name: "workspace/repo",
    links: {
      html: {
        href: "https://bitbucket.org/workspace/repo",
      },
      clone: [
        {
          name: "https",
          href: "https://bitbucket.org/workspace/repo.git",
        },
        {
          name: "ssh",
          href: "git@bitbucket.org:workspace/repo.git",
        },
      ],
    },
  };
}

function runWithBitbucket<Value>(
  effect: Effect.Effect<Value, BitbucketApiError, BitbucketApi>,
): Promise<Value> {
  return Effect.runPromise(effect.pipe(Effect.provide(Layer.effect(BitbucketApi, make()))));
}

describe("BitbucketApi", () => {
  it("fetches repository clone URLs with basic auth", async () => {
    process.env.T3CODE_BITBUCKET_EMAIL = "dev@example.com";
    process.env.T3CODE_BITBUCKET_API_TOKEN = "api-token";
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Promise.resolve(
          new Response(JSON.stringify(repositoryResponse()), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWithBitbucket(
      Effect.gen(function* () {
        const bitbucket = yield* BitbucketApi;
        return yield* bitbucket.getRepositoryCloneUrls({
          cwd: "/workspace",
          repository: "workspace/repo",
        });
      }),
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.bitbucket.org/2.0/repositories/workspace/repo",
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toBeInstanceOf(Headers);
    const headers = init?.headers as Headers;
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("dev@example.com:api-token").toString("base64")}`,
    );
    expect(result).toEqual({
      nameWithOwner: "workspace/repo",
      url: "https://bitbucket.org/workspace/repo.git",
      sshUrl: "git@bitbucket.org:workspace/repo.git",
    });
  });

  it("creates repositories with configured auth", async () => {
    process.env.T3CODE_BITBUCKET_EMAIL = "dev@example.com";
    process.env.T3CODE_BITBUCKET_API_TOKEN = "api-token";
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Promise.resolve(
          new Response(JSON.stringify(repositoryResponse()), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWithBitbucket(
      Effect.gen(function* () {
        const bitbucket = yield* BitbucketApi;
        return yield* bitbucket.createRepository({
          cwd: "/workspace",
          repository: "workspace/repo",
          visibility: "private",
        });
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bitbucket.org/2.0/repositories/workspace/repo",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scm: "git", is_private: true }),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toBeInstanceOf(Headers);
    const headers = init?.headers as Headers;
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("dev@example.com:api-token").toString("base64")}`,
    );
    expect(headers.get("content-type")).toBe("application/json");
    expect(result.nameWithOwner).toBe("workspace/repo");
  });

  it("rejects repository names without a workspace", async () => {
    const fetchMock = vi.fn(
      (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
        Promise.resolve(new Response("{}")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const bitbucket = yield* BitbucketApi;
        return yield* bitbucket.getRepositoryCloneUrls({
          cwd: "/workspace",
          repository: "repo",
        });
      }).pipe(Effect.provide(Layer.effect(BitbucketApi, make()))),
    );

    expect(result._tag).toBe("Failure");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, expect, vi } from "vitest";

vi.mock("../../processRunner", () => ({
  runProcess: vi.fn(),
}));

import { runProcess } from "../../processRunner";
import { GitLabCli } from "../Services/GitLabCli";
import { GitLabCliLive } from "./GitLabCli";

const mockedRunProcess = vi.mocked(runProcess);
const layer = it.layer(GitLabCliLive);

afterEach(() => {
  mockedRunProcess.mockReset();
});

layer("GitLabCliLive", (it) => {
  it.effect("reads repository clone URLs", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          path_with_namespace: "octocat/codething-mvp",
          web_url: "https://gitlab.com/octocat/codething-mvp",
          ssh_url_to_repo: "git@gitlab.com:octocat/codething-mvp.git",
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const glab = yield* GitLabCli;
        return yield* glab.getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "octocat/codething-mvp",
        });
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://gitlab.com/octocat/codething-mvp",
        sshUrl: "git@gitlab.com:octocat/codething-mvp.git",
      });
      expect(mockedRunProcess).toHaveBeenCalledWith(
        "glab",
        ["api", "projects/octocat%2Fcodething-mvp"],
        expect.objectContaining({ cwd: "/repo" }),
      );
    }),
  );

  it.effect("creates repositories in a namespace", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({ id: 123 }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          path_with_namespace: "octocat/codething-mvp",
          web_url: "https://gitlab.com/octocat/codething-mvp",
          ssh_url_to_repo: "git@gitlab.com:octocat/codething-mvp.git",
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const glab = yield* GitLabCli;
        return yield* glab.createRepository({
          cwd: "/repo",
          repository: "octocat/codething-mvp",
          visibility: "private",
        });
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://gitlab.com/octocat/codething-mvp",
        sshUrl: "git@gitlab.com:octocat/codething-mvp.git",
      });
      expect(mockedRunProcess).toHaveBeenNthCalledWith(
        1,
        "glab",
        ["api", "namespaces/octocat"],
        expect.objectContaining({ cwd: "/repo" }),
      );
      expect(mockedRunProcess).toHaveBeenNthCalledWith(
        2,
        "glab",
        [
          "api",
          "--method",
          "POST",
          "projects",
          "--raw-field",
          "path=codething-mvp",
          "--raw-field",
          "name=codething-mvp",
          "--raw-field",
          "visibility=private",
          "--raw-field",
          "namespace_id=123",
        ],
        expect.objectContaining({ cwd: "/repo" }),
      );
    }),
  );
});

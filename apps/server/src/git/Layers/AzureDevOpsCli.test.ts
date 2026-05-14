import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, expect, vi } from "vitest";

vi.mock("../../processRunner", () => ({
  runProcess: vi.fn(),
}));

import { runProcess } from "../../processRunner";
import { AzureDevOpsCli } from "../Services/AzureDevOpsCli";
import { AzureDevOpsCliLive } from "./AzureDevOpsCli";

const mockedRunProcess = vi.mocked(runProcess);
const layer = it.layer(AzureDevOpsCliLive);

afterEach(() => {
  mockedRunProcess.mockReset();
});

layer("AzureDevOpsCliLive", (it) => {
  it.effect("reads repository clone URLs", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          name: "codething-mvp",
          webUrl: "https://dev.azure.com/acme/project/_git/codething-mvp",
          remoteUrl: "https://dev.azure.com/acme/project/_git/codething-mvp",
          sshUrl: "git@ssh.dev.azure.com:v3/acme/project/codething-mvp",
          project: { name: "project" },
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const az = yield* AzureDevOpsCli;
        return yield* az.getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "project/codething-mvp",
        });
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "project/codething-mvp",
        url: "https://dev.azure.com/acme/project/_git/codething-mvp",
        sshUrl: "git@ssh.dev.azure.com:v3/acme/project/codething-mvp",
      });
      expect(mockedRunProcess).toHaveBeenCalledWith(
        "az",
        [
          "repos",
          "show",
          "--detect",
          "true",
          "--repository",
          "project/codething-mvp",
          "--only-show-errors",
          "--output",
          "json",
        ],
        expect.objectContaining({ cwd: "/repo" }),
      );
    }),
  );

  it.effect("creates repositories in a project", () =>
    Effect.gen(function* () {
      mockedRunProcess.mockResolvedValueOnce({
        stdout: JSON.stringify({
          name: "codething-mvp",
          webUrl: "https://dev.azure.com/acme/project/_git/codething-mvp",
          remoteUrl: "https://dev.azure.com/acme/project/_git/codething-mvp",
          sshUrl: "git@ssh.dev.azure.com:v3/acme/project/codething-mvp",
          project: { name: "project" },
        }),
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      });

      const result = yield* Effect.gen(function* () {
        const az = yield* AzureDevOpsCli;
        return yield* az.createRepository({
          cwd: "/repo",
          repository: "project/codething-mvp",
          visibility: "private",
        });
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "project/codething-mvp",
        url: "https://dev.azure.com/acme/project/_git/codething-mvp",
        sshUrl: "git@ssh.dev.azure.com:v3/acme/project/codething-mvp",
      });
      expect(mockedRunProcess).toHaveBeenCalledWith(
        "az",
        [
          "repos",
          "create",
          "--detect",
          "true",
          "--name",
          "codething-mvp",
          "--project",
          "project",
          "--only-show-errors",
          "--output",
          "json",
        ],
        expect.objectContaining({ cwd: "/repo" }),
      );
    }),
  );
});

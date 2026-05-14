import { describe, expect, it } from "vitest";

import { parseAzureAuth, parseGitHubAuth, parseGitLabAuth } from "./SourceControlDiscovery";

describe("SourceControlDiscovery", () => {
  it("parses GitHub CLI authenticated status without leaking token lines", () => {
    expect(
      parseGitHubAuth({
        code: 0,
        stdout: "",
        stderr: [
          "github.com",
          "  ✓ Logged in to github.com account octocat (/Users/maria/.config/gh/hosts.yml)",
          "  - Token: gho_secret",
        ].join("\n"),
      }),
    ).toEqual({
      status: "authenticated",
      account: "octocat",
      host: "github.com",
      detail: "github.com",
    });
  });

  it("parses GitLab CLI unauthenticated status", () => {
    expect(
      parseGitLabAuth({
        code: 1,
        stdout: "",
        stderr: "You are not logged into any GitLab hosts. Run glab auth login.",
      }),
    ).toEqual({
      status: "unauthenticated",
      account: null,
      host: null,
      detail: "You are not logged into any GitLab hosts. Run glab auth login.",
    });
  });

  it("parses Azure CLI active account", () => {
    expect(
      parseAzureAuth({
        code: 0,
        stdout: "maria@example.com\n",
        stderr: "",
      }),
    ).toEqual({
      status: "authenticated",
      account: "maria@example.com",
      host: "dev.azure.com",
      detail: "Azure CLI account is active.",
    });
  });
});

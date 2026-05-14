import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type { SourceControlRepositoryVisibility } from "@t3tools/contracts";

import type { ProcessRunResult } from "../../processRunner";
import type { GitLabCliError } from "../Errors";

export interface GitLabRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export interface GitLabCliShape {
  readonly execute: (input: {
    readonly cwd: string;
    readonly args: ReadonlyArray<string>;
    readonly timeoutMs?: number;
  }) => Effect.Effect<ProcessRunResult, GitLabCliError>;

  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly repository: string;
  }) => Effect.Effect<GitLabRepositoryCloneUrls, GitLabCliError>;

  readonly createRepository: (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly visibility: SourceControlRepositoryVisibility;
  }) => Effect.Effect<GitLabRepositoryCloneUrls, GitLabCliError>;
}

export class GitLabCli extends ServiceMap.Service<GitLabCli, GitLabCliShape>()(
  "t3/git/Services/GitLabCli",
) {}

import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type { SourceControlRepositoryVisibility } from "@t3tools/contracts";

import type { ProcessRunResult } from "../../processRunner";
import type { AzureDevOpsCliError } from "../Errors";

export interface AzureDevOpsRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export interface AzureDevOpsCliShape {
  readonly execute: (input: {
    readonly cwd: string;
    readonly args: ReadonlyArray<string>;
    readonly timeoutMs?: number;
  }) => Effect.Effect<ProcessRunResult, AzureDevOpsCliError>;

  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly repository: string;
  }) => Effect.Effect<AzureDevOpsRepositoryCloneUrls, AzureDevOpsCliError>;

  readonly createRepository: (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly visibility: SourceControlRepositoryVisibility;
  }) => Effect.Effect<AzureDevOpsRepositoryCloneUrls, AzureDevOpsCliError>;
}

export class AzureDevOpsCli extends ServiceMap.Service<AzureDevOpsCli, AzureDevOpsCliShape>()(
  "t3/git/Services/AzureDevOpsCli",
) {}

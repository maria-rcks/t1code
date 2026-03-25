import type {
  CheckpointRef,
  MessageId,
  OrchestrationLatestTurn,
  OrchestrationProposedPlanId,
  OrchestrationSessionStatus,
  OrchestrationThreadActivity,
  ProjectId,
  ProjectScript as ContractProjectScript,
  ProviderInteractionMode,
  ProviderKind,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";
export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";
export type ProjectScript = ContractProjectScript;

export interface ChatImageAttachment {
  type: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
}

export type ChatAttachment = ChatImageAttachment;

export interface ChatMessage {
  id: MessageId;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?: ChatAttachment[];
  createdAt: string;
  completedAt?: string | undefined;
  streaming: boolean;
}

export interface ProposedPlan {
  id: OrchestrationProposedPlanId;
  turnId: TurnId | null;
  planMarkdown: string;
  implementedAt: string | null;
  implementationThreadId: ThreadId | null;
  createdAt: string;
  updatedAt: string;
}

export interface TurnDiffFileChange {
  path: string;
  kind?: string | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
}

export interface TurnDiffSummary {
  turnId: TurnId;
  completedAt: string;
  status?: string | undefined;
  files: TurnDiffFileChange[];
  checkpointRef?: CheckpointRef | undefined;
  assistantMessageId?: MessageId | undefined;
  checkpointTurnCount?: number | undefined;
}

export interface Project {
  id: ProjectId;
  name: string;
  cwd: string;
  model: string;
  expanded: boolean;
  scripts: ProjectScript[];
}

export interface ThreadSession {
  provider: ProviderKind;
  status: SessionPhase | "error" | "closed";
  activeTurnId?: TurnId | undefined;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  orchestrationStatus: OrchestrationSessionStatus;
}

export interface Thread {
  id: ThreadId;
  codexThreadId: string | null;
  projectId: ProjectId;
  title: string;
  model: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  session: ThreadSession | null;
  messages: ChatMessage[];
  proposedPlans: ProposedPlan[];
  error: string | null;
  createdAt: string;
  latestTurn: OrchestrationLatestTurn | null;
  lastVisitedAt?: string | undefined;
  branch: string | null;
  worktreePath: string | null;
  turnDiffSummaries: TurnDiffSummary[];
  activities: OrchestrationThreadActivity[];
}

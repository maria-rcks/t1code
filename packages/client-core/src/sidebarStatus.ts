import type {
  OrchestrationLatestTurn,
  OrchestrationProposedPlan,
  ProviderInteractionMode,
} from "@t3tools/contracts";
import { findLatestProposedPlan, hasActionableProposedPlan } from "./sessionLogic";

export interface ThreadStatusPill {
  label:
    | "Working"
    | "Connecting"
    | "Completed"
    | "Pending Approval"
    | "Awaiting Input"
    | "Plan Ready";
  colorClass: string;
  dotClass: string;
  pulse: boolean;
}

const THREAD_STATUS_PRIORITY: Record<ThreadStatusPill["label"], number> = {
  "Pending Approval": 5,
  "Awaiting Input": 4,
  Working: 3,
  Connecting: 3,
  "Plan Ready": 2,
  Completed: 1,
};

type ThreadStatusSessionLike = {
  status?: string | null | undefined;
  orchestrationStatus?: string | null | undefined;
  activeTurnId?: string | null | undefined;
};

type ThreadStatusInput = {
  interactionMode: ProviderInteractionMode;
  latestTurn: Pick<OrchestrationLatestTurn, "turnId" | "startedAt" | "completedAt"> | null;
  lastVisitedAt?: string | undefined;
  proposedPlans: ReadonlyArray<OrchestrationProposedPlan>;
  session: ThreadStatusSessionLike | null;
};

function isLatestTurnSettledForSidebar(
  latestTurn: ThreadStatusInput["latestTurn"],
  session: ThreadStatusInput["session"],
): boolean {
  if (!latestTurn?.startedAt) return false;
  if (!latestTurn.completedAt) return false;
  if (!session) return true;

  const sessionStatus = session.orchestrationStatus ?? session.status ?? null;
  return (
    sessionStatus !== "running" && sessionStatus !== "starting" && sessionStatus !== "connecting"
  );
}

function hasUnseenCompletionForSidebar(thread: ThreadStatusInput): boolean {
  if (!thread.latestTurn?.completedAt) return false;
  const completedAt = Date.parse(thread.latestTurn.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!thread.lastVisitedAt) return true;

  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

function resolveSidebarSessionStatus(session: ThreadStatusInput["session"]): string | null {
  return session?.orchestrationStatus ?? session?.status ?? null;
}

function hasTrackedActiveTurn(session: ThreadStatusInput["session"]): boolean {
  return session?.activeTurnId !== undefined && session.activeTurnId !== null;
}

export function resolveThreadStatusPill(input: {
  thread: ThreadStatusInput;
  hasPendingApprovals: boolean;
  hasPendingUserInput: boolean;
}): ThreadStatusPill | null {
  const { hasPendingApprovals, hasPendingUserInput, thread } = input;

  if (hasPendingApprovals) {
    return {
      label: "Pending Approval",
      colorClass: "text-amber-600 dark:text-amber-300/90",
      dotClass: "bg-amber-500 dark:bg-amber-300/90",
      pulse: false,
    };
  }

  if (hasPendingUserInput) {
    return {
      label: "Awaiting Input",
      colorClass: "text-indigo-600 dark:text-indigo-300/90",
      dotClass: "bg-indigo-500 dark:bg-indigo-300/90",
      pulse: false,
    };
  }

  const sessionStatus = resolveSidebarSessionStatus(thread.session);
  if (
    sessionStatus === "running" ||
    (hasTrackedActiveTurn(thread.session) && sessionStatus === "ready")
  ) {
    return {
      label: "Working",
      colorClass: "text-sky-600 dark:text-sky-300/80",
      dotClass: "bg-sky-500 dark:bg-sky-300/80",
      pulse: true,
    };
  }

  if (sessionStatus === "connecting" || sessionStatus === "starting") {
    return {
      label: "Connecting",
      colorClass: "text-sky-600 dark:text-sky-300/80",
      dotClass: "bg-sky-500 dark:bg-sky-300/80",
      pulse: true,
    };
  }

  const hasPlanReadyPrompt =
    !hasPendingUserInput &&
    thread.interactionMode === "plan" &&
    isLatestTurnSettledForSidebar(thread.latestTurn, thread.session) &&
    hasActionableProposedPlan(
      findLatestProposedPlan(thread.proposedPlans, thread.latestTurn?.turnId ?? null),
    );
  if (hasPlanReadyPrompt) {
    return {
      label: "Plan Ready",
      colorClass: "text-violet-600 dark:text-violet-300/90",
      dotClass: "bg-violet-500 dark:bg-violet-300/90",
      pulse: false,
    };
  }

  if (hasUnseenCompletionForSidebar(thread)) {
    return {
      label: "Completed",
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
      pulse: false,
    };
  }

  return null;
}

export function resolveProjectStatusIndicator(
  statuses: ReadonlyArray<ThreadStatusPill | null>,
): ThreadStatusPill | null {
  let highestPriorityStatus: ThreadStatusPill | null = null;

  for (const status of statuses) {
    if (status === null) continue;
    if (
      highestPriorityStatus === null ||
      THREAD_STATUS_PRIORITY[status.label] > THREAD_STATUS_PRIORITY[highestPriorityStatus.label]
    ) {
      highestPriorityStatus = status;
    }
  }

  return highestPriorityStatus;
}

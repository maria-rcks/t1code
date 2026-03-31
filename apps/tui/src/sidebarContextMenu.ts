import type { OrchestrationReadModel } from "@t3tools/contracts";

export type SidebarContextMenuActionId =
  | "rename"
  | "generate-title"
  | "mark-unread"
  | "copy-path"
  | "copy-thread-id"
  | "delete";

export type ThreadSelectionState = {
  selectedThreadIds: ReadonlySet<string>;
  anchorThreadId: string | null;
};

export type SidebarContextMenuItem = {
  id: SidebarContextMenuActionId;
  label: string;
  destructive?: boolean;
};

export type ProjectRemovalConfirmStep = {
  title: string;
  body?: string;
  confirmLabel: string;
};

type ThreadReadModel = OrchestrationReadModel["threads"][number];

export function buildThreadContextMenuItems(): readonly SidebarContextMenuItem[] {
  return [
    { id: "rename", label: "Rename thread" },
    { id: "generate-title", label: "Generate title" },
    { id: "mark-unread", label: "Mark unread" },
    { id: "copy-path", label: "Copy Path" },
    { id: "copy-thread-id", label: "Copy Thread ID" },
    { id: "delete", label: "Delete", destructive: true },
  ];
}

export function buildProjectContextMenuItems(): readonly SidebarContextMenuItem[] {
  return [{ id: "delete", label: "Remove project", destructive: true }];
}

export function buildProjectRemovalConfirmSteps(
  projectTitle: string,
  threadCount: number,
): readonly ProjectRemovalConfirmStep[] {
  if (threadCount <= 0) {
    return [
      {
        title: `Remove project "${projectTitle}"?`,
        confirmLabel: "Remove",
      },
    ];
  }

  const threadLabel = `${threadCount} thread${threadCount === 1 ? "" : "s"}`;
  return [
    {
      title: `Remove project "${projectTitle}"?`,
      body: `Removing this project will also remove ${threadLabel}. Continue to confirm.`,
      confirmLabel: "Continue",
    },
    {
      title: `Remove project "${projectTitle}" and ${threadLabel}?`,
      body: "This permanently removes the project and all conversation history inside it.",
      confirmLabel: "Remove project",
    },
  ];
}

export function buildMultiSelectContextMenuItems(count: number): readonly SidebarContextMenuItem[] {
  return [
    { id: "mark-unread", label: `Mark unread (${count})` },
    { id: "delete", label: `Delete (${count})`, destructive: true },
  ];
}

export function markThreadUnreadLocally(
  threadIds: ReadonlySet<string>,
  thread: Pick<ThreadReadModel, "id" | "latestTurn">,
): ReadonlySet<string> {
  if (!thread.latestTurn?.completedAt) return threadIds;
  if (threadIds.has(thread.id)) return threadIds;
  return new Set([...threadIds, thread.id]);
}

export function clearLocallyUnreadThread(
  threadIds: ReadonlySet<string>,
  threadId: string | null | undefined,
): ReadonlySet<string> {
  if (!threadId || !threadIds.has(threadId)) return threadIds;
  const next = new Set(threadIds);
  next.delete(threadId);
  return next;
}

export function toggleThreadSelection(
  selection: ThreadSelectionState,
  threadId: string,
): ThreadSelectionState {
  const next = new Set(selection.selectedThreadIds);
  if (next.has(threadId)) {
    next.delete(threadId);
  } else {
    next.add(threadId);
  }
  return {
    selectedThreadIds: next,
    anchorThreadId: next.has(threadId) ? threadId : selection.anchorThreadId,
  };
}

export function rangeSelectThreads(
  selection: ThreadSelectionState,
  threadId: string,
  orderedThreadIds: readonly string[],
): ThreadSelectionState {
  const anchor = selection.anchorThreadId;
  if (anchor === null) {
    return {
      selectedThreadIds: new Set([...selection.selectedThreadIds, threadId]),
      anchorThreadId: threadId,
    };
  }

  const anchorIndex = orderedThreadIds.indexOf(anchor);
  const targetIndex = orderedThreadIds.indexOf(threadId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return {
      selectedThreadIds: new Set([...selection.selectedThreadIds, threadId]),
      anchorThreadId: threadId,
    };
  }

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const next = new Set(selection.selectedThreadIds);
  for (let index = start; index <= end; index += 1) {
    const id = orderedThreadIds[index];
    if (id) {
      next.add(id);
    }
  }
  return {
    selectedThreadIds: next,
    anchorThreadId: anchor,
  };
}

export function clearThreadSelection(): ThreadSelectionState {
  return {
    selectedThreadIds: new Set(),
    anchorThreadId: null,
  };
}

export function removeFromThreadSelection(
  selection: ThreadSelectionState,
  threadIds: readonly string[],
): ThreadSelectionState {
  const toRemove = new Set(threadIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selection.selectedThreadIds) {
    if (toRemove.has(id)) {
      changed = true;
    } else {
      next.add(id);
    }
  }
  if (!changed) return selection;
  return {
    selectedThreadIds: next,
    anchorThreadId:
      selection.anchorThreadId !== null && toRemove.has(selection.anchorThreadId)
        ? null
        : selection.anchorThreadId,
  };
}

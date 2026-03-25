import type { SidebarProjectSortOrder, SidebarThreadSortOrder } from "./appSettings";

type SidebarMessage = {
  role?: string | null | undefined;
  createdAt?: string | null | undefined;
};

type SidebarProject = {
  id: string;
  name?: string | null | undefined;
  title?: string | null | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
};

type SidebarThread = {
  id: string;
  projectId: string;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  messages: readonly SidebarMessage[];
};

function toSortableTimestamp(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getLatestUserMessageTimestamp(
  thread: Pick<SidebarThread, "messages" | "createdAt" | "updatedAt">,
): number {
  let latestUserMessageTimestamp: number | null = null;

  for (const message of thread.messages) {
    if (message.role !== "user") continue;
    const messageTimestamp = toSortableTimestamp(message.createdAt);
    if (messageTimestamp === null) continue;
    latestUserMessageTimestamp =
      latestUserMessageTimestamp === null
        ? messageTimestamp
        : Math.max(latestUserMessageTimestamp, messageTimestamp);
  }

  if (latestUserMessageTimestamp !== null) {
    return latestUserMessageTimestamp;
  }

  return toSortableTimestamp(thread.updatedAt ?? thread.createdAt) ?? Number.NEGATIVE_INFINITY;
}

function getThreadSortTimestamp(
  thread: Pick<SidebarThread, "messages" | "createdAt" | "updatedAt">,
  sortOrder: SidebarThreadSortOrder | Exclude<SidebarProjectSortOrder, "manual">,
): number {
  if (sortOrder === "created_at") {
    return toSortableTimestamp(thread.createdAt) ?? Number.NEGATIVE_INFINITY;
  }

  return getLatestUserMessageTimestamp(thread);
}

function getProjectSortTimestamp(
  project: SidebarProject,
  projectThreads: readonly Pick<SidebarThread, "messages" | "createdAt" | "updatedAt">[],
  sortOrder: Exclude<SidebarProjectSortOrder, "manual">,
): number {
  if (projectThreads.length > 0) {
    return projectThreads.reduce(
      (latest, thread) => Math.max(latest, getThreadSortTimestamp(thread, sortOrder)),
      Number.NEGATIVE_INFINITY,
    );
  }

  if (sortOrder === "created_at") {
    return toSortableTimestamp(project.createdAt) ?? Number.NEGATIVE_INFINITY;
  }

  return toSortableTimestamp(project.updatedAt ?? project.createdAt) ?? Number.NEGATIVE_INFINITY;
}

function getProjectLabel(project: SidebarProject): string {
  return project.name ?? project.title ?? "";
}

export function sortThreadsForSidebar<TThread extends SidebarThread>(
  threads: readonly TThread[],
  sortOrder: SidebarThreadSortOrder,
): TThread[] {
  return [...threads].toSorted((left, right) => {
    const rightTimestamp = getThreadSortTimestamp(right, sortOrder);
    const leftTimestamp = getThreadSortTimestamp(left, sortOrder);
    const byTimestamp =
      rightTimestamp === leftTimestamp ? 0 : rightTimestamp > leftTimestamp ? 1 : -1;
    if (byTimestamp !== 0) return byTimestamp;
    return right.id.localeCompare(left.id);
  });
}

export function sortProjectsForSidebar<
  TProject extends SidebarProject,
  TThread extends SidebarThread,
>(
  projects: readonly TProject[],
  threads: readonly TThread[],
  sortOrder: SidebarProjectSortOrder,
): TProject[] {
  if (sortOrder === "manual") {
    return [...projects];
  }

  const threadsByProjectId = new Map<string, TThread[]>();
  for (const thread of threads) {
    const existing = threadsByProjectId.get(thread.projectId) ?? [];
    existing.push(thread);
    threadsByProjectId.set(thread.projectId, existing);
  }

  return [...projects].toSorted((left, right) => {
    const rightTimestamp = getProjectSortTimestamp(
      right,
      threadsByProjectId.get(right.id) ?? [],
      sortOrder,
    );
    const leftTimestamp = getProjectSortTimestamp(
      left,
      threadsByProjectId.get(left.id) ?? [],
      sortOrder,
    );
    const byTimestamp =
      rightTimestamp === leftTimestamp ? 0 : rightTimestamp > leftTimestamp ? 1 : -1;
    if (byTimestamp !== 0) return byTimestamp;
    return (
      getProjectLabel(left).localeCompare(getProjectLabel(right)) || left.id.localeCompare(right.id)
    );
  });
}

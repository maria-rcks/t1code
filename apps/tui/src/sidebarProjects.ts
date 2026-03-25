export function ensureProjectExpanded(
  expandedProjectIds: ReadonlySet<string>,
  projectId: string,
): ReadonlySet<string> {
  if (expandedProjectIds.has(projectId)) return expandedProjectIds;
  return new Set([...expandedProjectIds, projectId]);
}

export function collapseProject(
  expandedProjectIds: ReadonlySet<string>,
  projectId: string,
): ReadonlySet<string> {
  if (!expandedProjectIds.has(projectId)) return expandedProjectIds;
  const next = new Set(expandedProjectIds);
  next.delete(projectId);
  return next;
}

export function pruneExpandedProjects(
  expandedProjectIds: ReadonlySet<string>,
  projectIds: readonly string[],
): ReadonlySet<string> {
  const liveProjectIds = new Set(projectIds);
  let changed = false;
  const next = new Set<string>();
  for (const projectId of expandedProjectIds) {
    if (liveProjectIds.has(projectId)) {
      next.add(projectId);
    } else {
      changed = true;
    }
  }
  return changed ? next : expandedProjectIds;
}

export function resolveProjectExpansionOnRowPress(input: {
  expandedProjectIds: ReadonlySet<string>;
  projectId: string;
  isProjectActive: boolean;
}): ReadonlySet<string> {
  const { expandedProjectIds, projectId, isProjectActive } = input;
  if (!expandedProjectIds.has(projectId)) {
    return ensureProjectExpanded(expandedProjectIds, projectId);
  }
  return isProjectActive ? collapseProject(expandedProjectIds, projectId) : expandedProjectIds;
}

export function resolveProjectPrimaryAction(input: {
  activeProjectId: string | undefined;
  expandedProjectIds: ReadonlySet<string>;
  threadCount: number;
}): "open-project-path" | "expand-project" | "focus-threads" | "create-thread" {
  const { activeProjectId, expandedProjectIds, threadCount } = input;
  if (!activeProjectId) return "open-project-path";
  if (!expandedProjectIds.has(activeProjectId)) return "expand-project";
  if (threadCount > 0) return "focus-threads";
  return "create-thread";
}

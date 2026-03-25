import { describe, expect, it } from "vitest";

import {
  collapseProject,
  ensureProjectExpanded,
  pruneExpandedProjects,
  resolveProjectPrimaryAction,
  resolveProjectExpansionOnRowPress,
} from "./sidebarProjects";

describe("sidebarProjects", () => {
  it("expands a collapsed active project when pressed again", () => {
    const expanded = resolveProjectExpansionOnRowPress({
      expandedProjectIds: new Set<string>(),
      projectId: "project-a",
      isProjectActive: true,
    });

    expect([...expanded]).toEqual(["project-a"]);
  });

  it("collapses an expanded active project when pressed", () => {
    const expanded = resolveProjectExpansionOnRowPress({
      expandedProjectIds: new Set(["project-a"]),
      projectId: "project-a",
      isProjectActive: true,
    });

    expect([...expanded]).toEqual([]);
  });

  it("keeps an expanded inactive project open when selecting it", () => {
    const expanded = resolveProjectExpansionOnRowPress({
      expandedProjectIds: new Set(["project-a"]),
      projectId: "project-a",
      isProjectActive: false,
    });

    expect(expanded).toEqual(new Set(["project-a"]));
  });

  it("prunes deleted projects from the expanded set", () => {
    const expanded = pruneExpandedProjects(new Set(["project-a", "project-b"]), ["project-a"]);

    expect(expanded).toEqual(new Set(["project-a"]));
  });

  it("returns the same set when the state already matches", () => {
    const expanded = new Set(["project-a"]);
    const collapsed = new Set<string>();

    expect(ensureProjectExpanded(expanded, "project-a")).toBe(expanded);
    expect(collapseProject(collapsed, "project-a")).toBe(collapsed);
  });

  it("reopens a collapsed active project before moving focus into threads", () => {
    expect(
      resolveProjectPrimaryAction({
        activeProjectId: "project-a",
        expandedProjectIds: new Set<string>(),
        threadCount: 3,
      }),
    ).toBe("expand-project");
  });

  it("focuses threads only after the active project is already expanded", () => {
    expect(
      resolveProjectPrimaryAction({
        activeProjectId: "project-a",
        expandedProjectIds: new Set(["project-a"]),
        threadCount: 3,
      }),
    ).toBe("focus-threads");
  });
});

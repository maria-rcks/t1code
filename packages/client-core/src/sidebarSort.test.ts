import { describe, expect, it } from "vitest";

import { sortProjectsForSidebar, sortThreadsForSidebar } from "./sidebarSort";

describe("sortThreadsForSidebar", () => {
  it("does not reorder a thread when only assistant activity updates updatedAt", () => {
    const threads = [
      {
        id: "thread-older-user",
        projectId: "project-1",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-25T12:00:00.000Z",
        messages: [
          { role: "user", createdAt: "2026-03-20T10:00:00.000Z" },
          { role: "assistant", createdAt: "2026-03-25T12:00:00.000Z" },
        ],
      },
      {
        id: "thread-newer-user",
        projectId: "project-1",
        createdAt: "2026-03-21T10:00:00.000Z",
        updatedAt: "2026-03-21T10:05:00.000Z",
        messages: [{ role: "user", createdAt: "2026-03-21T10:00:00.000Z" }],
      },
    ] as const;

    expect(sortThreadsForSidebar(threads, "updated_at").map((thread) => thread.id)).toEqual([
      "thread-newer-user",
      "thread-older-user",
    ]);
  });

  it("supports created_at ordering for stable chronological sorting", () => {
    const threads = [
      {
        id: "thread-1",
        projectId: "project-1",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-25T12:00:00.000Z",
        messages: [],
      },
      {
        id: "thread-2",
        projectId: "project-1",
        createdAt: "2026-03-21T10:00:00.000Z",
        updatedAt: "2026-03-21T11:00:00.000Z",
        messages: [],
      },
    ] as const;

    expect(sortThreadsForSidebar(threads, "created_at").map((thread) => thread.id)).toEqual([
      "thread-2",
      "thread-1",
    ]);
  });
});

describe("sortProjectsForSidebar", () => {
  it("preserves manual order", () => {
    const projects = [
      { id: "project-b", title: "Project B", createdAt: "", updatedAt: "" },
      { id: "project-a", title: "Project A", createdAt: "", updatedAt: "" },
    ] as const;

    expect(sortProjectsForSidebar(projects, [], "manual").map((project) => project.id)).toEqual([
      "project-b",
      "project-a",
    ]);
  });

  it("sorts projects by latest user activity across their threads", () => {
    const projects = [
      { id: "project-1", title: "Project 1", createdAt: "", updatedAt: "" },
      { id: "project-2", title: "Project 2", createdAt: "", updatedAt: "" },
    ] as const;
    const threads = [
      {
        id: "thread-1",
        projectId: "project-1",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-25T12:00:00.000Z",
        messages: [
          { role: "user", createdAt: "2026-03-20T10:00:00.000Z" },
          { role: "assistant", createdAt: "2026-03-25T12:00:00.000Z" },
        ],
      },
      {
        id: "thread-2",
        projectId: "project-2",
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:05:00.000Z",
        messages: [{ role: "user", createdAt: "2026-03-24T10:00:00.000Z" }],
      },
    ] as const;

    expect(
      sortProjectsForSidebar(projects, threads, "updated_at").map((project) => project.id),
    ).toEqual(["project-2", "project-1"]);
  });
});

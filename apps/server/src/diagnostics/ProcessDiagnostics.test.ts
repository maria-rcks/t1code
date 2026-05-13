import { describe, expect, it } from "vitest";

import { aggregateProcessDiagnostics, parsePosixProcessRows } from "./ProcessDiagnostics";

describe("ProcessDiagnostics", () => {
  it("parses POSIX ps rows", () => {
    const rows = parsePosixProcessRows(
      [
        " 100 1 100 Ss 0.1 2048 00:01:00 bun server",
        " 101 100 100 S 2.5 1024 00:00:10 codex app-server",
        " 102 101 100 S 0.0 512 00:00:01 node child",
        " invalid row",
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        pid: 100,
        ppid: 1,
        pgid: 100,
        status: "Ss",
        cpuPercent: 0.1,
        rssBytes: 2_097_152,
        elapsed: "00:01:00",
        command: "bun server",
      },
      {
        pid: 101,
        ppid: 100,
        pgid: 100,
        status: "S",
        cpuPercent: 2.5,
        rssBytes: 1_048_576,
        elapsed: "00:00:10",
        command: "codex app-server",
      },
      {
        pid: 102,
        ppid: 101,
        pgid: 100,
        status: "S",
        cpuPercent: 0,
        rssBytes: 524_288,
        elapsed: "00:00:01",
        command: "node child",
      },
    ]);
  });

  it("aggregates descendant processes and excludes the diagnostics query", () => {
    const rows = parsePosixProcessRows(
      [
        " 100 1 100 Ss 0.1 2048 00:01:00 bun server",
        " 101 100 100 S 2.5 1024 00:00:10 codex app-server",
        " 102 101 100 S 0.0 512 00:00:01 node child",
        " 103 100 100 R 0.1 64 00:00:00 ps -axo pid=,ppid=,pgid=,stat=,pcpu=,rss=,etime=,command=",
      ].join("\n"),
    );

    const result = aggregateProcessDiagnostics({
      serverPid: 100,
      rows,
      readAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      serverPid: 100,
      readAt: "2026-01-01T00:00:00.000Z",
      processCount: 2,
      totalRssBytes: 1_572_864,
      totalCpuPercent: 2.5,
      processes: [
        {
          pid: 101,
          ppid: 100,
          pgid: 100,
          status: "S",
          cpuPercent: 2.5,
          rssBytes: 1_048_576,
          elapsed: "00:00:10",
          command: "codex app-server",
          depth: 0,
          childPids: [102],
        },
        {
          pid: 102,
          ppid: 101,
          pgid: 100,
          status: "S",
          cpuPercent: 0,
          rssBytes: 524_288,
          elapsed: "00:00:01",
          command: "node child",
          depth: 1,
          childPids: [],
        },
      ],
      error: null,
    });
  });
});

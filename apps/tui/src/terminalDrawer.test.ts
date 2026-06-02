import { describe, expect, it } from "vitest";
import {
  TUI_TERMINAL_MAX_OUTPUT_CHARS,
  applyTerminalEventToSession,
  formatTerminalStatus,
  terminalSessionFromSnapshot,
} from "./terminalDrawer";

describe("terminal drawer state", () => {
  it("builds a display session from a terminal snapshot", () => {
    const session = terminalSessionFromSnapshot({
      threadId: "thread-1",
      terminalId: "default",
      cwd: "/repo",
      status: "running",
      pid: 123,
      history: "\u001b[32mready\u001b[0m\n",
      exitCode: null,
      exitSignal: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(session).toMatchObject({
      terminalId: "default",
      cwd: "/repo",
      status: "running",
      pid: 123,
      output: "ready\n",
      exitCode: null,
      exitSignal: null,
      hasRunningSubprocess: false,
    });
  });

  it("appends output events and trims retained history", () => {
    const session = applyTerminalEventToSession(undefined, {
      type: "output",
      threadId: "thread-1",
      terminalId: "default",
      createdAt: "2026-01-01T00:00:00.000Z",
      data: `${"x".repeat(TUI_TERMINAL_MAX_OUTPUT_CHARS)}tail`,
    });

    expect(session.output.length).toBe(TUI_TERMINAL_MAX_OUTPUT_CHARS);
    expect(session.output.endsWith("tail")).toBe(true);
  });

  it("tracks lifecycle and activity events", () => {
    const running = terminalSessionFromSnapshot({
      threadId: "thread-1",
      terminalId: "default",
      cwd: "/repo",
      status: "running",
      pid: 123,
      history: "",
      exitCode: null,
      exitSignal: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const active = applyTerminalEventToSession(running, {
      type: "activity",
      threadId: "thread-1",
      terminalId: "default",
      createdAt: "2026-01-01T00:00:01.000Z",
      hasRunningSubprocess: true,
    });
    const exited = applyTerminalEventToSession(active, {
      type: "exited",
      threadId: "thread-1",
      terminalId: "default",
      createdAt: "2026-01-01T00:00:02.000Z",
      exitCode: 0,
      exitSignal: null,
    });

    expect(formatTerminalStatus(active)).toBe("Running command");
    expect(formatTerminalStatus(exited)).toBe("Exited 0");
  });
});

import type { TerminalEvent, TerminalSessionSnapshot } from "@t3tools/contracts";

export const TUI_TERMINAL_DEFAULT_ROWS = 12;
export const TUI_TERMINAL_MAX_OUTPUT_CHARS = 60_000;

export type TuiTerminalSession = {
  readonly terminalId: string;
  readonly cwd: string;
  readonly status: TerminalSessionSnapshot["status"];
  readonly pid: number | null;
  readonly output: string;
  readonly exitCode: number | null;
  readonly exitSignal: number | null;
  readonly error: string | null;
  readonly hasRunningSubprocess: boolean;
  readonly updatedAt: string;
};

const TERMINAL_ANSI_SEQUENCE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  "g",
);

function trimTerminalOutput(output: string): string {
  if (output.length <= TUI_TERMINAL_MAX_OUTPUT_CHARS) return output;
  return output.slice(output.length - TUI_TERMINAL_MAX_OUTPUT_CHARS);
}

function stripTerminalAnsiSequences(value: string): string {
  return value.replace(TERMINAL_ANSI_SEQUENCE_PATTERN, "");
}

export function terminalSessionFromSnapshot(snapshot: TerminalSessionSnapshot): TuiTerminalSession {
  return {
    terminalId: snapshot.terminalId,
    cwd: snapshot.cwd,
    status: snapshot.status,
    pid: snapshot.pid,
    output: trimTerminalOutput(stripTerminalAnsiSequences(snapshot.history)),
    exitCode: snapshot.exitCode,
    exitSignal: snapshot.exitSignal,
    error: null,
    hasRunningSubprocess: false,
    updatedAt: snapshot.updatedAt,
  };
}

export function applyTerminalEventToSession(
  session: TuiTerminalSession | undefined,
  event: TerminalEvent,
): TuiTerminalSession {
  if (event.type === "started" || event.type === "restarted") {
    return terminalSessionFromSnapshot(event.snapshot);
  }
  const current =
    session ??
    ({
      terminalId: event.terminalId,
      cwd: "",
      status: "starting",
      pid: null,
      output: "",
      exitCode: null,
      exitSignal: null,
      error: null,
      hasRunningSubprocess: false,
      updatedAt: event.createdAt,
    } satisfies TuiTerminalSession);

  if (event.type === "output") {
    return {
      ...current,
      output: trimTerminalOutput(current.output + stripTerminalAnsiSequences(event.data)),
      updatedAt: event.createdAt,
    };
  }
  if (event.type === "exited") {
    return {
      ...current,
      status: "exited",
      exitCode: event.exitCode,
      exitSignal: event.exitSignal,
      hasRunningSubprocess: false,
      updatedAt: event.createdAt,
    };
  }
  if (event.type === "error") {
    return {
      ...current,
      status: "error",
      error: event.message,
      hasRunningSubprocess: false,
      output: trimTerminalOutput(`${current.output}\n[terminal] ${event.message}\n`),
      updatedAt: event.createdAt,
    };
  }
  if (event.type === "cleared") {
    return {
      ...current,
      output: "",
      updatedAt: event.createdAt,
    };
  }
  return {
    ...current,
    hasRunningSubprocess: event.hasRunningSubprocess,
    updatedAt: event.createdAt,
  };
}

export function formatTerminalStatus(session: TuiTerminalSession | undefined): string {
  if (!session) return "Not started";
  if (session.status === "running") {
    return session.hasRunningSubprocess
      ? "Running command"
      : session.pid
        ? `Running · pid ${session.pid}`
        : "Running";
  }
  if (session.status === "exited") {
    return session.exitCode === null ? "Exited" : `Exited ${session.exitCode}`;
  }
  if (session.status === "error") return "Error";
  return "Starting";
}

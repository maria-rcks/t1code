import { describe, expect, it } from "vitest";

import {
  DEFAULT_TUI_THREAD_TERMINAL_HEIGHT,
  applyTerminalEvent,
  buildTerminalViewportRows,
  resolveTuiThreadTerminalHeight,
  terminalInputFromKey,
  upsertTerminalSnapshot,
} from "./threadTerminal";

describe("threadTerminal", () => {
  it("maps the shared default terminal height to a sensible TUI drawer height", () => {
    expect(resolveTuiThreadTerminalHeight(280, 48)).toBe(DEFAULT_TUI_THREAD_TERMINAL_HEIGHT);
  });

  it("renders VT output from the terminal screen state", async () => {
    const initial = upsertTerminalSnapshot({}, "thread-1", {
      threadId: "thread-1",
      terminalId: "default",
      cwd: "/repo",
      status: "running",
      pid: 10,
      history: "prompt> ",
      exitCode: null,
      exitSignal: null,
      updatedAt: "2026-04-08T00:00:00.000Z",
    });

    const next = await new Promise<ReturnType<typeof applyTerminalEvent>>((resolve) => {
      const updated = applyTerminalEvent(
        initial,
        {
          type: "output",
          threadId: "thread-1",
          terminalId: "default",
          createdAt: "2026-04-08T00:00:01.000Z",
          data: "echo hi\r\nhi\r\n",
        },
        null,
        {
          onScreenMutation: () => resolve(updated),
        },
      );
    });

    expect(next["thread-1"]?.default?.history).toContain("echo hi\r\nhi\r\n");
    const rows = buildTerminalViewportRows(next["thread-1"]?.default, {
      rows: 4,
      cols: 20,
      theme: {
        defaultForeground: "#ffffff",
        defaultBackground: "#000000",
        cursorForeground: "#000000",
        cursorBackground: "#ffffff",
        ansi: Array.from({ length: 16 }, () => "#ffffff"),
      },
      focused: false,
    });
    expect(rows[0]?.content.chunks.map((chunk) => chunk.text).join("")).toContain(
      "prompt> echo hi",
    );
    expect(rows[1]?.content.chunks.map((chunk) => chunk.text).join("")).toContain("hi");
  });

  it("uses escape sequences for arrow navigation when the renderer does not provide one", () => {
    expect(
      terminalInputFromKey({
        name: "up",
        ctrl: false,
        meta: false,
      }),
    ).toBe("\u001b[A");
  });
});

import type {
  TerminalEvent,
  TerminalSessionSnapshot,
  TerminalSessionStatus,
} from "@t3tools/contracts";
import { RGBA, StyledText, createTextAttributes, type TextChunk } from "@opentui/core";
import { Terminal, type IBufferCell } from "@xterm/xterm";

export const DEFAULT_TUI_THREAD_TERMINAL_HEIGHT = 12;
export const MIN_TUI_THREAD_TERMINAL_HEIGHT = 8;
export const TERMINAL_HEADER_ROWS = 4;
const MAX_TERMINAL_TRANSCRIPT_CHARS = 120_000;
const DEFAULT_TUI_TERMINAL_COLS = 80;
const DEFAULT_TUI_TERMINAL_ROWS = 24;
const TUI_TERMINAL_SCROLLBACK = 5_000;

type TerminalScreen = {
  terminal: Terminal;
  cols: number;
  rows: number;
};

export interface TuiThreadTerminalSession {
  terminalId: string;
  cwd: string;
  status: TerminalSessionStatus | "idle";
  history: string;
  exitCode: number | null;
  exitSignal: number | null;
  updatedAt: string | null;
  errorMessage: string | null;
  hasRunningSubprocess: boolean;
  screen: TerminalScreen;
}

export type TuiThreadTerminalSessionsByThreadId = Readonly<
  Record<string, Readonly<Record<string, TuiThreadTerminalSession>>>
>;

export interface TuiThreadTerminalMutationOptions {
  onScreenMutation?: () => void;
}

export interface TuiTerminalColorTheme {
  readonly defaultForeground: string;
  readonly defaultBackground: string;
  readonly cursorForeground: string;
  readonly cursorBackground: string;
  readonly ansi: readonly string[];
}

export interface TuiTerminalViewportRow {
  readonly id: string;
  readonly content: StyledText;
  readonly trailingColumns: number;
}

export interface TuiTerminalViewportState {
  readonly viewportY: number;
  readonly maxViewportY: number;
  readonly totalRows: number;
  readonly visibleRows: number;
}

const RGB_CACHE = new Map<string, RGBA>();

function rgbaFromHex(color: string): RGBA {
  const cached = RGB_CACHE.get(color);
  if (cached) {
    return cached;
  }
  const next = RGBA.fromHex(color);
  RGB_CACHE.set(color, next);
  return next;
}

function createTerminalScreen(cols: number, rows: number): TerminalScreen {
  return {
    terminal: new Terminal({
      cols,
      rows,
      scrollback: TUI_TERMINAL_SCROLLBACK,
      disableStdin: true,
      cursorStyle: "block",
      cursorBlink: false,
    }),
    cols,
    rows,
  };
}

function destroyTerminalScreen(screen: TerminalScreen): void {
  screen.terminal.dispose();
}

function clampTerminalCols(cols: number | undefined): number {
  if (!Number.isFinite(cols) || !cols) {
    return DEFAULT_TUI_TERMINAL_COLS;
  }
  return Math.max(20, Math.round(cols));
}

function clampTerminalRows(rows: number | undefined): number {
  if (!Number.isFinite(rows) || !rows) {
    return DEFAULT_TUI_TERMINAL_ROWS;
  }
  return Math.max(5, Math.round(rows));
}

function truncateTerminalTranscript(text: string): string {
  if (text.length <= MAX_TERMINAL_TRANSCRIPT_CHARS) {
    return text;
  }
  return text.slice(text.length - MAX_TERMINAL_TRANSCRIPT_CHARS);
}

function writeScreenData(
  screen: TerminalScreen,
  data: string,
  options?: TuiThreadTerminalMutationOptions,
): void {
  if (!data) {
    return;
  }
  screen.terminal.write(data, () => {
    options?.onScreenMutation?.();
  });
}

function hydrateTerminalScreen(
  screen: TerminalScreen,
  history: string,
  options?: TuiThreadTerminalMutationOptions,
): void {
  screen.terminal.reset();
  if (history.length === 0) {
    options?.onScreenMutation?.();
    return;
  }
  writeScreenData(screen, history, options);
}

function sessionFromSnapshot(
  snapshot: TerminalSessionSnapshot,
  currentSession?: TuiThreadTerminalSession,
  options?: TuiThreadTerminalMutationOptions,
): TuiThreadTerminalSession {
  const cols = currentSession?.screen.cols ?? DEFAULT_TUI_TERMINAL_COLS;
  const rows = currentSession?.screen.rows ?? DEFAULT_TUI_TERMINAL_ROWS;
  const screen = createTerminalScreen(cols, rows);
  const history = truncateTerminalTranscript(snapshot.history);
  hydrateTerminalScreen(screen, history, options);
  return {
    terminalId: snapshot.terminalId,
    cwd: snapshot.cwd,
    status: snapshot.status,
    history,
    exitCode: snapshot.exitCode,
    exitSignal: snapshot.exitSignal,
    updatedAt: snapshot.updatedAt,
    errorMessage: null,
    hasRunningSubprocess: false,
    screen,
  };
}

function defaultSession(
  terminalId: string,
  cwd: string,
  cols: number = DEFAULT_TUI_TERMINAL_COLS,
  rows: number = DEFAULT_TUI_TERMINAL_ROWS,
): TuiThreadTerminalSession {
  return {
    terminalId,
    cwd,
    status: "idle",
    history: "",
    exitCode: null,
    exitSignal: null,
    updatedAt: null,
    errorMessage: null,
    hasRunningSubprocess: false,
    screen: createTerminalScreen(cols, rows),
  };
}

export function resolveTuiThreadTerminalHeight(
  terminalHeight: number,
  viewportRows: number,
): number {
  const defaultHeight =
    !Number.isFinite(terminalHeight) || terminalHeight <= 0 || terminalHeight >= 60
      ? DEFAULT_TUI_THREAD_TERMINAL_HEIGHT
      : Math.round(terminalHeight);
  const maxHeight = Math.max(
    MIN_TUI_THREAD_TERMINAL_HEIGHT,
    Math.min(18, Math.floor(viewportRows * 0.45)),
  );
  return Math.min(Math.max(defaultHeight, MIN_TUI_THREAD_TERMINAL_HEIGHT), maxHeight);
}

export function resolveTuiTerminalViewportRows(totalHeight: number): number {
  return Math.max(5, totalHeight - TERMINAL_HEADER_ROWS);
}

export function upsertTerminalSnapshot(
  state: TuiThreadTerminalSessionsByThreadId,
  threadId: string,
  snapshot: TerminalSessionSnapshot,
  options?: TuiThreadTerminalMutationOptions,
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[threadId] ?? {};
  const currentSession = currentThread[snapshot.terminalId];
  const nextSession = sessionFromSnapshot(snapshot, currentSession, options);
  if (currentSession) {
    destroyTerminalScreen(currentSession.screen);
  }
  return {
    ...state,
    [threadId]: {
      ...currentThread,
      [snapshot.terminalId]: nextSession,
    },
  };
}

export function ensureTerminalSession(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; cwd: string; cols?: number; rows?: number },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId] ?? {};
  if (currentThread[input.terminalId]) {
    return state;
  }
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: defaultSession(
        input.terminalId,
        input.cwd,
        clampTerminalCols(input.cols),
        clampTerminalRows(input.rows),
      ),
    },
  };
}

export function resizeTerminalSessionViewport(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; cols: number; rows: number },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  const currentSession = currentThread?.[input.terminalId];
  if (!currentThread || !currentSession) {
    return state;
  }
  const cols = clampTerminalCols(input.cols);
  const rows = clampTerminalRows(input.rows);
  if (currentSession.screen.cols === cols && currentSession.screen.rows === rows) {
    return state;
  }
  currentSession.screen.cols = cols;
  currentSession.screen.rows = rows;
  currentSession.screen.terminal.resize(cols, rows);
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: {
        ...currentSession,
        screen: currentSession.screen,
      },
    },
  };
}

export function scrollTerminalSessionViewport(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; delta: number },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  const currentSession = currentThread?.[input.terminalId];
  const delta = Math.trunc(input.delta);
  if (!currentThread || !currentSession || delta === 0) {
    return state;
  }
  currentSession.screen.terminal.scrollLines(delta);
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: {
        ...currentSession,
        screen: currentSession.screen,
      },
    },
  };
}

export function scrollTerminalSessionViewportByPage(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; pageCount: number },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  const currentSession = currentThread?.[input.terminalId];
  const pageCount = Math.trunc(input.pageCount);
  if (!currentThread || !currentSession || pageCount === 0) {
    return state;
  }
  currentSession.screen.terminal.scrollPages(pageCount);
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: {
        ...currentSession,
        screen: currentSession.screen,
      },
    },
  };
}

export function jumpTerminalSessionViewport(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; target: "top" | "bottom" },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  const currentSession = currentThread?.[input.terminalId];
  if (!currentThread || !currentSession) {
    return state;
  }
  if (input.target === "top") {
    currentSession.screen.terminal.scrollToTop();
  } else {
    currentSession.screen.terminal.scrollToBottom();
  }
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: {
        ...currentSession,
        screen: currentSession.screen,
      },
    },
  };
}

export function setTerminalSessionViewportPosition(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string; viewportY: number },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  const currentSession = currentThread?.[input.terminalId];
  if (!currentThread || !currentSession) {
    return state;
  }
  const buffer = currentSession.screen.terminal.buffer.active;
  const maxViewportY = Math.max(0, buffer.baseY);
  const nextViewportY = Math.max(0, Math.min(Math.round(input.viewportY), maxViewportY));
  const delta = nextViewportY - buffer.viewportY;
  if (delta === 0) {
    return state;
  }
  currentSession.screen.terminal.scrollLines(delta);
  return {
    ...state,
    [input.threadId]: {
      ...currentThread,
      [input.terminalId]: {
        ...currentSession,
        screen: currentSession.screen,
      },
    },
  };
}

export function removeTerminalSession(
  state: TuiThreadTerminalSessionsByThreadId,
  input: { threadId: string; terminalId: string },
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[input.threadId];
  if (!currentThread || !currentThread[input.terminalId]) {
    return state;
  }
  destroyTerminalScreen(currentThread[input.terminalId]!.screen);
  const { [input.terminalId]: _removed, ...remainingThread } = currentThread;
  if (Object.keys(remainingThread).length === 0) {
    const { [input.threadId]: _removedThread, ...remaining } = state;
    return remaining;
  }
  return {
    ...state,
    [input.threadId]: remainingThread,
  };
}

export function removeOrphanedTerminalSessions(
  state: TuiThreadTerminalSessionsByThreadId,
  activeThreadIds: ReadonlySet<string>,
): TuiThreadTerminalSessionsByThreadId {
  let changed = false;
  const next: Record<string, Readonly<Record<string, TuiThreadTerminalSession>>> = {};
  for (const [threadId, sessions] of Object.entries(state)) {
    if (!activeThreadIds.has(threadId)) {
      changed = true;
      for (const session of Object.values(sessions)) {
        destroyTerminalScreen(session.screen);
      }
      continue;
    }
    next[threadId] = sessions;
  }
  return changed ? next : state;
}

export function applyTerminalEvent(
  state: TuiThreadTerminalSessionsByThreadId,
  event: TerminalEvent,
  cwdFallback: string | null = null,
  options?: TuiThreadTerminalMutationOptions,
): TuiThreadTerminalSessionsByThreadId {
  const currentThread = state[event.threadId] ?? {};
  const currentSession =
    currentThread[event.terminalId] ??
    defaultSession(
      event.terminalId,
      cwdFallback ?? "",
      DEFAULT_TUI_TERMINAL_COLS,
      DEFAULT_TUI_TERMINAL_ROWS,
    );
  let nextSession = currentSession;

  switch (event.type) {
    case "started":
    case "restarted":
      nextSession = sessionFromSnapshot(event.snapshot, currentSession, options);
      if (currentSession !== nextSession) {
        destroyTerminalScreen(currentSession.screen);
      }
      break;
    case "output":
      nextSession = {
        ...currentSession,
        history: truncateTerminalTranscript(`${currentSession.history}${event.data}`),
        updatedAt: event.createdAt,
        errorMessage: null,
      };
      writeScreenData(currentSession.screen, event.data, options);
      break;
    case "exited":
      nextSession = {
        ...currentSession,
        status: "exited",
        exitCode: event.exitCode,
        exitSignal: event.exitSignal,
        updatedAt: event.createdAt,
        hasRunningSubprocess: false,
      };
      break;
    case "error":
      nextSession = {
        ...currentSession,
        status: "error",
        errorMessage: event.message,
        updatedAt: event.createdAt,
      };
      break;
    case "cleared": {
      const screen = createTerminalScreen(currentSession.screen.cols, currentSession.screen.rows);
      destroyTerminalScreen(currentSession.screen);
      nextSession = {
        ...currentSession,
        history: "",
        updatedAt: event.createdAt,
        errorMessage: null,
        screen,
      };
      options?.onScreenMutation?.();
      break;
    }
    case "activity":
      nextSession = {
        ...currentSession,
        hasRunningSubprocess: event.hasRunningSubprocess,
        updatedAt: event.createdAt,
      };
      break;
  }

  return {
    ...state,
    [event.threadId]: {
      ...currentThread,
      [event.terminalId]: nextSession,
    },
  };
}

function ansiColorHex(index: number, theme: TuiTerminalColorTheme): string {
  if (index < theme.ansi.length && theme.ansi[index]) {
    return theme.ansi[index]!;
  }
  if (index < 16) {
    return theme.defaultForeground;
  }
  if (index < 232) {
    const cubeIndex = index - 16;
    const red = Math.floor(cubeIndex / 36);
    const green = Math.floor((cubeIndex % 36) / 6);
    const blue = cubeIndex % 6;
    const component = [0, 95, 135, 175, 215, 255];
    return `#${component[red]!.toString(16).padStart(2, "0")}${component[green]!.toString(
      16,
    ).padStart(2, "0")}${component[blue]!.toString(16).padStart(2, "0")}`;
  }
  const gray = 8 + (index - 232) * 10;
  const hex = gray.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

function resolveCellColor(
  cell: IBufferCell,
  target: "fg" | "bg",
  theme: TuiTerminalColorTheme,
): RGBA {
  const isDefault = target === "fg" ? cell.isFgDefault() : cell.isBgDefault();
  if (isDefault) {
    return rgbaFromHex(target === "fg" ? theme.defaultForeground : theme.defaultBackground);
  }

  const isRgb = target === "fg" ? cell.isFgRGB() : cell.isBgRGB();
  const colorValue = target === "fg" ? cell.getFgColor() : cell.getBgColor();
  if (isRgb) {
    return rgbaFromHex(`#${colorValue.toString(16).padStart(6, "0")}`);
  }

  return rgbaFromHex(ansiColorHex(colorValue, theme));
}

function buildCellChunk(options: {
  cell: IBufferCell;
  theme: TuiTerminalColorTheme;
  isCursor: boolean;
}): TextChunk {
  const { cell, theme, isCursor } = options;
  const cellChars = cell.getChars() || " ";
  let fg = resolveCellColor(cell, "fg", theme);
  let bg = resolveCellColor(cell, "bg", theme);
  if (cell.isInverse()) {
    [fg, bg] = [bg, fg];
  }
  if (cell.isInvisible()) {
    fg = bg;
  }
  if (isCursor) {
    fg = rgbaFromHex(theme.cursorForeground);
    bg = rgbaFromHex(theme.cursorBackground);
  }
  return {
    __isChunk: true,
    text: cellChars,
    fg,
    bg,
    attributes: createTextAttributes({
      bold: Boolean(cell.isBold()),
      italic: Boolean(cell.isItalic()),
      underline: Boolean(cell.isUnderline()),
      dim: Boolean(cell.isDim()),
      blink: Boolean(cell.isBlink()),
      strikethrough: Boolean(cell.isStrikethrough()),
    }),
  };
}

function mergeTextChunks(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }
  const merged: TextChunk[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.attributes === chunk.attributes &&
      previous.fg?.equals(chunk.fg) === true &&
      previous.bg?.equals(chunk.bg) === true
    ) {
      previous.text += chunk.text;
      continue;
    }
    merged.push({ ...chunk });
  }
  return merged;
}

export function buildTerminalViewportRows(
  session: TuiThreadTerminalSession | null | undefined,
  options: {
    rows: number;
    cols: number;
    theme: TuiTerminalColorTheme;
    focused: boolean;
  },
): readonly TuiTerminalViewportRow[] {
  return buildTerminalBufferRows(session, {
    startRow: session ? session.screen.terminal.buffer.active.viewportY : 0,
    rows: options.rows,
    cols: options.cols,
    theme: options.theme,
    focused: options.focused,
  });
}

export function buildTerminalBufferRows(
  session: TuiThreadTerminalSession | null | undefined,
  options: {
    startRow: number;
    rows: number;
    cols: number;
    theme: TuiTerminalColorTheme;
    focused: boolean;
  },
): readonly TuiTerminalViewportRow[] {
  const rowCount = clampTerminalRows(options.rows);
  const colCount = clampTerminalCols(options.cols);
  if (!session) {
    return Array.from({ length: rowCount }, (_, rowNumber) => ({
      id: `empty:${rowNumber}`,
      content: new StyledText([]),
      trailingColumns: colCount,
    }));
  }

  const buffer = session.screen.terminal.buffer.active;
  const cursorY = options.focused ? buffer.cursorY : -1;
  const cursorX = options.focused ? Math.min(buffer.cursorX, Math.max(colCount - 1, 0)) : -1;
  const startRow = Math.max(0, options.startRow);
  const nullCell = buffer.getNullCell();

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const absoluteRow = startRow + rowIndex;
    const line = buffer.getLine(absoluteRow);
    if (!line) {
      return {
        id: `line:${absoluteRow}:blank`,
        content: new StyledText([]),
        trailingColumns: colCount,
      };
    }

    const chunks: TextChunk[] = [];
    let lastContentColumn = -1;
    for (let x = 0; x < colCount; x += 1) {
      const cell = line.getCell(x, nullCell);
      if (!cell || cell.getWidth() === 0) {
        continue;
      }
      const isCursor = absoluteRow === buffer.viewportY + cursorY && x === cursorX;
      const chars = cell.getChars() || "";
      if (isCursor || chars.trim().length > 0) {
        lastContentColumn = Math.max(lastContentColumn, x + Math.max(cell.getWidth(), 1) - 1);
      }
      chunks.push(
        buildCellChunk({
          cell,
          theme: options.theme,
          isCursor,
        }),
      );
    }

    const mergedChunks = mergeTextChunks(chunks);
    const selectableColumns = Math.max(lastContentColumn + 1, 0);
    const trimmedChunks: TextChunk[] = [];
    let remainingColumns = selectableColumns;
    for (const chunk of mergedChunks) {
      if (remainingColumns <= 0) {
        break;
      }
      if (chunk.text.length <= remainingColumns) {
        trimmedChunks.push(chunk);
        remainingColumns -= chunk.text.length;
        continue;
      }
      trimmedChunks.push({
        ...chunk,
        text: chunk.text.slice(0, remainingColumns),
      });
      remainingColumns = 0;
    }

    return {
      id: `line:${absoluteRow}`,
      content: new StyledText(trimmedChunks),
      trailingColumns: Math.max(colCount - selectableColumns, 0),
    };
  });
}

export function resolveTerminalViewportState(
  session: TuiThreadTerminalSession | null | undefined,
  rows: number,
): TuiTerminalViewportState {
  const visibleRows = clampTerminalRows(rows);
  if (!session) {
    return {
      viewportY: 0,
      maxViewportY: 0,
      totalRows: visibleRows,
      visibleRows,
    };
  }

  const buffer = session.screen.terminal.buffer.active;
  const maxViewportY = Math.max(0, buffer.baseY);
  return {
    viewportY: Math.max(0, Math.min(buffer.viewportY, maxViewportY)),
    maxViewportY,
    totalRows: Math.max(visibleRows, maxViewportY + visibleRows),
    visibleRows,
  };
}

export function terminalInputFromKey(key: {
  name: string;
  sequence?: string;
  ctrl: boolean;
  meta: boolean;
  super?: boolean;
}): string | null {
  if (key.meta || key.super) {
    return null;
  }
  if (typeof key.sequence === "string" && key.sequence.length > 0) {
    return key.sequence;
  }
  switch (key.name) {
    case "return":
    case "enter":
    case "kpenter":
    case "linefeed":
      return "\r";
    case "backspace":
    case "delete":
      return "\u007f";
    case "tab":
      return "\t";
    case "space":
      return " ";
    case "up":
      return "\u001b[A";
    case "down":
      return "\u001b[B";
    case "right":
      return "\u001b[C";
    case "left":
      return "\u001b[D";
    case "home":
      return "\u001b[H";
    case "end":
      return "\u001b[F";
    case "pageup":
      return "\u001b[5~";
    case "pagedown":
      return "\u001b[6~";
    case "insert":
      return "\u001b[2~";
    case "escape":
      return "\u001b";
    default:
      return null;
  }
}

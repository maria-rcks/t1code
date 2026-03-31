import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  InputRenderable,
  PasteEvent,
  ScrollBoxRenderable,
  TerminalConsole,
  TextareaRenderable,
} from "@opentui/core";
import {
  decodePasteBytes,
  pathToFiletype,
  RGBA,
  stripAnsiSequences,
  SyntaxStyle,
} from "@opentui/core";
import {
  ApprovalRequestId,
  type ClaudeCodeEffort,
  type CodexReasoningEffort,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_OPTIONS_BY_PROVIDER,
  ORCHESTRATION_WS_METHODS,
  type ClientOrchestrationCommand,
  type EditorId,
  type GitActionProgressEvent,
  type GitListBranchesResult,
  type GitStackedAction,
  type GitStatusResult,
  type OrchestrationReadModel,
  type ProjectEntry,
  type ProviderApprovalDecision,
  type ProviderInteractionMode,
  type ProviderKind,
  type ProviderModelOptions,
  type RuntimeMode,
  type ServerConfig,
} from "@t3tools/contracts";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_APP_THEME,
  DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
  DEFAULT_SIDEBAR_THREAD_SORT_ORDER,
  DEFAULT_TIMESTAMP_FORMAT,
  buildPendingUserInputAnswers,
  buildGitActionMenuItems,
  buildPlanImplementationPrompt,
  getAppModelOptions,
  getCustomModelsForProvider,
  getProviderStartOptions,
  MAX_CUSTOM_MODEL_LENGTH,
  MODEL_PROVIDER_SETTINGS,
  normalizeAppSettings,
  patchCustomModels,
  sortProjectsForSidebar,
  sortThreadsForSidebar,
  type AppSettings,
  type AppTheme,
  type PendingUserInputDraftAnswer,
  type SidebarProjectSortOrder,
  type SidebarThreadSortOrder,
  type TimestampFormat,
  createTransportNativeApi,
  derivePendingApprovals,
  derivePendingUserInputProgress,
  derivePendingUserInputs,
  deriveTimelineEntries,
  deriveWorkLogEntries,
  findLatestProposedPlan,
  hasActionableProposedPlan,
  PROVIDER_OPTIONS,
  SLASH_COMMAND_DEFINITIONS,
  newCommandId,
  newMessageId,
  newProjectId,
  newThreadId,
  parseSlashCommandInput,
  resolvePlanFollowUpSubmission,
  resolveProjectStatusIndicator,
  resolveQuickAction,
  resolveThreadStatusPill,
  type ChatAttachment,
  type GitActionMenuItem,
  type ThreadStatusPill,
  type TimelineEntry,
  WsTransport,
} from "@t3tools/client-core";
import {
  applyClaudePromptEffortPrefix,
  getDefaultReasoningEffort,
  getModelOptions,
  getReasoningEffortOptions,
  isClaudeUltrathinkPrompt,
  normalizeModelSlug,
  normalizeClaudeModelOptions,
  normalizeCodexModelOptions,
  resolveReasoningEffortForProvider,
  resolveSelectableModel,
  supportsClaudeFastMode,
  supportsClaudeThinkingToggle,
  supportsClaudeUltrathinkKeyword,
} from "@t3tools/shared/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import packageJson from "../package.json";
import { resolveTuiPaths } from "./config";
import { resolveComposerPrimaryAction } from "./composerAction";
import { parseStandaloneComposerModeCommand } from "./composerCommands";
import { formatReasoningEffortLabel, truncateToolbarLabel } from "./composerControlLabels";
import {
  createDeferredComposerSyncState,
  invalidateDeferredComposerSync,
  scheduleDeferredComposerSync,
} from "./composerSync";
import {
  resolveComposerSubmission,
  resolveImageAttachmentFromPath,
  type ResolvedComposerImageAttachment,
} from "./composerSubmit";
import { saveClipboardImageToFile } from "./clipboardImage";
import {
  KEYBINDING_GUIDE_SECTIONS,
  isCtrlC,
  isCtrlShiftA,
  shouldClearComposerOnCtrlC,
  shouldCopyComposerSelectionOnCtrlShiftC,
  shouldInterruptComposerOnEscape,
} from "./keyboardBehavior";
import { createT1Logger } from "./log";
import { resolveUserMessageBubbleWidth } from "./messageLayout";
import {
  isDiffLikeCodeBlockFiletype,
  parseMessageMarkdownSegments,
  resolveCodeBlockFiletype,
  truncateCodeBlockContent,
} from "./messageMarkdown";
import { openExternalUrl } from "./openExternal";
import { type TuiPrefs, readPrefs, writePrefs } from "./prefs";
import { resolveTuiResponsiveLayout, TUI_SIDEBAR_WIDTH } from "./responsiveLayout";
import { resolveAttachedServerConnection, startServerSupervisor } from "./serverSupervisor";
import { createCoalescedRefreshRunner } from "./snapshotRefresh";
import {
  cacheRemoteAttachmentToFile,
  clearTerminalImagePreview,
  renderKittyImagePreview,
  resolveTerminalImageSupport,
  type TerminalImageSupport,
} from "./terminalImages";
import {
  buildMultiSelectContextMenuItems,
  buildProjectRemovalConfirmSteps,
  buildProjectContextMenuItems,
  buildThreadContextMenuItems,
  clearThreadSelection,
  clearLocallyUnreadThread,
  markThreadUnreadLocally,
  rangeSelectThreads,
  removeFromThreadSelection,
  type SidebarContextMenuActionId,
  toggleThreadSelection,
} from "./sidebarContextMenu";
import {
  collapseProject,
  ensureProjectExpanded,
  pruneExpandedProjects,
  resolveProjectPrimaryAction,
  resolveProjectExpansionOnRowPress,
} from "./sidebarProjects";
import { DEFAULT_THREAD_TITLE, truncateTitleForDisplay } from "./threadTitle";
import { isThreadActivelyWorking } from "./threadSessionState";
import {
  DRAFT_THREAD_ID_PREFIX,
  isDraftThreadId,
  shouldApplyWelcomeBootstrapSelection,
  shouldClearPendingCreatedThread,
} from "./threadSelection";
import { resolveWorkEntryIcon } from "./workEntryIcons";

type FocusArea =
  | "projects"
  | "threads"
  | "controls"
  | "composer"
  | "timeline"
  | "diff"
  | "settings";
type MainView = "thread" | "settings" | "keybindings";
type ThreadEnvMode = "local" | "worktree";
type OverlayMenu =
  | null
  | "model"
  | "traits"
  | "settings-select"
  | "sidebar-sort"
  | "git-actions"
  | "composer-env"
  | "composer-branch";
type SettingsSelectKind =
  | "theme"
  | "timestamp-format"
  | "thread-env"
  | "git-model"
  | "custom-model-provider";
type SidebarSortMenuItem = {
  id: string;
  section: "Sort projects" | "Sort threads";
  label: string;
  selected: boolean;
  onSelect: () => void;
};

const EMPTY_PENDING_USER_INPUT_ANSWERS: Readonly<Record<string, PendingUserInputDraftAnswer>> = {};
type T1Api = ReturnType<typeof createTransportNativeApi>["api"];
type ThreadReadModel = OrchestrationReadModel["threads"][number];
type ProjectReadModel = OrchestrationReadModel["projects"][number];
type TuiServerConfig = ServerConfig | null;
type DraftComposerImageAttachment = ResolvedComposerImageAttachment & {
  localPath?: string;
};
type ComposerMention = {
  type: "path";
  path: string;
  kind: ProjectEntry["kind"];
  parentPath?: string;
};
type ComposerImageAttachment = ChatAttachment | DraftComposerImageAttachment;
type PendingSendPreview = {
  threadId: string;
  messageId: string;
  text: string;
  mentions: ComposerMention[];
  attachments: ComposerImageAttachment[];
  createdAt: string;
  visibleUntil: number;
};
type InterruptedTurnRecovery = {
  threadId: string;
  turnId: string;
  messageId: string;
  text: string;
  mentions: ComposerMention[];
  attachments: DraftComposerImageAttachment[];
  createdAt: string;
};
type SuppressedInterruptedTurnState = {
  turnId: string;
  messageId: string;
};
type DraftThreadState = {
  id: string;
  projectId: string;
  branch: string | null;
  worktreePath: string | null;
  envMode: ThreadEnvMode;
};
type ComposerDraftState = {
  text: string;
  mentions: ComposerMention[];
  attachments: DraftComposerImageAttachment[];
};
type PendingUserInputAnswerMap = Record<string, PendingUserInputDraftAnswer>;
type LocalThreadVisitedState = Readonly<Record<string, string>>;
type ImagePreviewState = {
  attachment: ComposerImageAttachment;
  filePath: string | null;
  status: "loading" | "ready" | "error";
  error: string | null;
};

const SIDEBAR_PROJECT_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};

const SIDEBAR_THREAD_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};
const SELECTION_COPY_TOAST_MESSAGE = "Copied to clipboard";
const EMPTY_SUPPRESSED_INTERRUPTED_TURNS: readonly SuppressedInterruptedTurnState[] = [];

type ComposerPathTrigger = {
  query: string;
  rangeStart: number;
  rangeEnd: number;
};
type ParsedDiffFile = {
  readonly key: string;
  readonly filePath: string;
  readonly patch: string;
  readonly addedLines: number;
  readonly removedLines: number;
  readonly filetype?: string;
};
type TuiGitMenuItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly disabled: boolean;
  readonly kind: "action" | "pull" | "open_pr";
  readonly action?: GitStackedAction;
};
type ComposerEnvMenuItem = {
  readonly id: ThreadEnvMode;
  readonly label: string;
  readonly icon: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
};
type ComposerBranchMenuItem = {
  readonly id: string;
  readonly label: string;
  readonly branch: GitListBranchesResult["branches"][number];
  readonly selected: boolean;
  readonly trailingLabel?: string;
};
const OPEN_TUI_DIFF_METADATA_PREFIXES = [
  "diff --git ",
  "index ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "rename from ",
  "rename to ",
] as const;
const WORKTREE_BRANCH_PREFIX = "t3code";
const ENV_MODE_OPTIONS: ReadonlyArray<{
  readonly value: ThreadEnvMode;
  readonly label: string;
  readonly icon: string;
}> = [
  { value: "local", label: "Local", icon: "󰉋" },
  { value: "worktree", label: "New worktree", icon: "󰙅" },
];

function cloneDraftAttachment(
  attachment: DraftComposerImageAttachment,
): DraftComposerImageAttachment {
  return { ...attachment };
}

function cloneComposerMention(mention: ComposerMention): ComposerMention {
  return { ...mention };
}

function cloneComposerDraftState(draft: ComposerDraftState): ComposerDraftState {
  return {
    text: draft.text,
    mentions: draft.mentions.map(cloneComposerMention),
    attachments: draft.attachments.map(cloneDraftAttachment),
  };
}

function pruneLocalThreadVisitedState(
  visitedByThreadId: LocalThreadVisitedState,
  threadIds: ReadonlySet<string>,
): LocalThreadVisitedState {
  let changed = false;
  const next: Record<string, string> = {};
  for (const [threadId, visitedAt] of Object.entries(visitedByThreadId)) {
    if (!threadIds.has(threadId)) {
      changed = true;
      continue;
    }
    next[threadId] = visitedAt;
  }
  return changed ? next : visitedByThreadId;
}

function pruneLocallyUnreadThreadIds(
  unreadThreadIds: ReadonlySet<string>,
  threadIds: ReadonlySet<string>,
): ReadonlySet<string> {
  let changed = false;
  const next = new Set<string>();
  for (const threadId of unreadThreadIds) {
    if (!threadIds.has(threadId)) {
      changed = true;
      continue;
    }
    next.add(threadId);
  }
  return changed ? next : unreadThreadIds;
}

type SidebarMouseEvent = {
  button?: number;
  x?: number;
  y?: number;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
  };
  preventDefault: () => void;
  stopPropagation?: () => void;
};
type SidebarContextMenuState =
  | {
      kind: "project";
      projectId: string;
      x: number;
      y: number;
      selectedIndex: number;
    }
  | {
      kind: "multi-thread";
      threadIds: readonly string[];
      x: number;
      y: number;
      selectedIndex: number;
    }
  | {
      kind: "thread";
      projectId: string;
      threadId: string;
      x: number;
      y: number;
      selectedIndex: number;
    };
type ConfirmDialogState = {
  title: string;
  body?: string;
  confirmLabel: string;
  escapeBehavior?: "cancel" | "confirm";
  ctrlCBehavior?: "cancel" | "confirm";
  onConfirm: () => Promise<void>;
};
type RenameThreadDialogState = {
  threadId: string;
  value: string;
};
type TraitsMenuItem = {
  id: string;
  section: string;
  label: string;
  selected?: boolean;
  onSelect: () => void;
};
type InstallBinarySettingsKey = "claudeBinaryPath" | "codexBinaryPath";
type InstallProviderSettings = {
  provider: ProviderKind;
  title: string;
  binaryPathKey: InstallBinarySettingsKey;
  binaryPlaceholder: string;
  binaryDescription: string;
  homePathKey?: "codexHomePath";
  homePlaceholder?: string;
  homeDescription?: string;
};
const DARK_PALETTE = {
  canvas: "#171717",
  sidebar: "#151515",
  main: "#171717",
  surface: "#1b1b1b",
  surfaceAlt: "#1f1f1f",
  input: "#111111",
  surfaceUser: "#202020",
  surfacePlan: "#1f221c",
  surfaceWarn: "#262016",
  surfaceInfo: "#1d2026",
  footer: "#171717",
  diff: "#1b1b1b",
  popup: "#1c1c1c",
  scrim: "#00000099",
  border: "#252525",
  divider: "#2d2d2d",
  control: "transparent",
  controlHover: "#202020",
  controlActive: "#292929",
  controlActiveStrong: "#1e1e1e",
  controlInset: "#141414",
  controlInsetHover: "#1a1a1a",
  composerPanel: "#1a1a1a",
  composerBorder: "#2a3f95",
  composerBorderMuted: "#313131",
  composerSend: "#2f438e",
  composerSendHover: "#3c57ba",
  composerStop: "#dc2626",
  composerStopHover: "#ef4444",
  accent: "#7c87ff",
  cursor: "#d4d4d4",
  selection: "#1f4f95",
  selectionActive: "#2b61b0",
  text: "#f5f5f5",
  muted: "#a3a3a3",
  subtle: "#737373",
  success: "#10b981",
  info: "#3b82f6",
  warning: "#f59e0b",
  claude: "#d97757",
  macRed: "#ff5f57",
  macYellow: "#febc2e",
  macGreen: "#28c840",
};

const LIGHT_PALETTE = {
  canvas: "#f5f5f5",
  sidebar: "#eeeeee",
  main: "#f7f7f7",
  surface: "#ffffff",
  surfaceAlt: "#f1f1f1",
  input: "#ffffff",
  surfaceUser: "#ececec",
  surfacePlan: "#eef6ec",
  surfaceWarn: "#fff5e6",
  surfaceInfo: "#eef4ff",
  footer: "#f7f7f7",
  diff: "#fafafa",
  popup: "#ffffff",
  scrim: "#00000022",
  border: "#dddddd",
  divider: "#d8d8d8",
  control: "transparent",
  controlHover: "#ebebeb",
  controlActive: "#e2e2e2",
  controlActiveStrong: "#cdcdcd",
  controlInset: "#e7e7e7",
  controlInsetHover: "#dddddd",
  composerPanel: "#ffffff",
  composerBorder: "#0891b2",
  composerBorderMuted: "#d0d0d0",
  composerSend: "#60a5fa",
  composerSendHover: "#3b82f6",
  composerStop: "#dc2626",
  composerStopHover: "#ef4444",
  accent: "#0891b2",
  cursor: "#a3a3a3",
  selection: "#dbeafe",
  selectionActive: "#bfdbfe",
  text: "#171717",
  muted: "#666666",
  subtle: "#8a8a8a",
  success: "#059669",
  info: "#2563eb",
  warning: "#d97706",
  claude: "#c96d4d",
  macRed: "#ff5f57",
  macYellow: "#febc2e",
  macGreen: "#28c840",
};

const PALETTE = { ...DARK_PALETTE };

function themedScrollboxStyle(backgroundColor: string) {
  return {
    backgroundColor,
    rootOptions: {
      backgroundColor,
    },
    wrapperOptions: {
      backgroundColor,
    },
    viewportOptions: {
      backgroundColor,
    },
    contentOptions: {
      backgroundColor,
    },
    scrollbarOptions: {
      trackOptions: {
        foregroundColor: PALETTE.subtle,
        backgroundColor: PALETTE.controlActive,
      },
    },
  };
}

const APP_VERSION = packageJson.version ?? "0.0.0";
const THEME_OPTIONS: readonly AppTheme[] = ["system", "light", "dark"];
const TIMESTAMP_FORMAT_OPTIONS: readonly TimestampFormat[] = ["locale", "12-hour", "24-hour"];
const TIMESTAMP_FORMAT_LABELS: Record<TimestampFormat, string> = {
  locale: "System default",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
};
const INSTALL_PROVIDER_SETTINGS: readonly InstallProviderSettings[] = [
  {
    provider: "codex",
    title: "Codex",
    binaryPathKey: "codexBinaryPath",
    binaryPlaceholder: "Codex binary path",
    binaryDescription: "Leave blank to use codex from your PATH.",
    homePathKey: "codexHomePath",
    homePlaceholder: "CODEX_HOME",
    homeDescription: "Optional custom Codex home and config directory.",
  },
  {
    provider: "claudeAgent",
    title: "Claude",
    binaryPathKey: "claudeBinaryPath",
    binaryPlaceholder: "Claude binary path",
    binaryDescription: "Leave blank to use claude from your PATH.",
  },
] as const;
function buildMessageMarkdownSyntax(palette: typeof PALETTE) {
  return SyntaxStyle.fromStyles({
    keyword: { fg: RGBA.fromHex(palette.warning), bold: true },
    string: { fg: RGBA.fromHex("#9bd1ff") },
    comment: { fg: RGBA.fromHex(palette.subtle), italic: true },
    number: { fg: RGBA.fromHex("#8cc8ff") },
    function: { fg: RGBA.fromHex(palette.accent) },
    type: { fg: RGBA.fromHex("#f7b267") },
    operator: { fg: RGBA.fromHex(palette.warning) },
    variable: { fg: RGBA.fromHex(palette.text) },
    property: { fg: RGBA.fromHex("#8cc8ff") },
    "punctuation.bracket": { fg: RGBA.fromHex(palette.text) },
    "punctuation.delimiter": { fg: RGBA.fromHex(palette.muted) },
    "punctuation.special": { fg: RGBA.fromHex(palette.subtle) },
    "markup.heading": { fg: RGBA.fromHex(palette.text), bold: true },
    "markup.heading.1": {
      fg: RGBA.fromHex(palette.text),
      bold: true,
      underline: true,
    },
    "markup.heading.2": { fg: RGBA.fromHex(palette.text), bold: true },
    "markup.heading.3": { fg: RGBA.fromHex(palette.text), bold: true },
    "markup.bold": { fg: RGBA.fromHex(palette.text), bold: true },
    "markup.strong": { fg: RGBA.fromHex(palette.text), bold: true },
    "markup.italic": { fg: RGBA.fromHex(palette.text), italic: true },
    "markup.list": { fg: RGBA.fromHex(palette.muted) },
    "markup.quote": { fg: RGBA.fromHex(palette.muted), italic: true },
    "markup.raw": {
      fg: RGBA.fromHex("#9bd1ff"),
      bg: RGBA.fromHex(palette.surfaceAlt),
    },
    "markup.raw.block": {
      fg: RGBA.fromHex("#9bd1ff"),
      bg: RGBA.fromHex(palette.surfaceAlt),
    },
    "markup.raw.inline": {
      fg: RGBA.fromHex("#9bd1ff"),
      bg: RGBA.fromHex(palette.surfaceAlt),
    },
    "markup.link": { fg: RGBA.fromHex("#7fb7ff"), underline: true },
    "markup.link.label": { fg: RGBA.fromHex("#b7d7ff"), underline: true },
    "markup.link.url": { fg: RGBA.fromHex("#7fb7ff"), underline: true },
    label: { fg: RGBA.fromHex(palette.success) },
    conceal: { fg: RGBA.fromHex(palette.subtle) },
    default: { fg: RGBA.fromHex(palette.text) },
  });
}

function buildDiffSyntax(palette: typeof PALETTE) {
  return SyntaxStyle.fromStyles({
    keyword: { fg: RGBA.fromHex("#ff7b72"), bold: true },
    string: { fg: RGBA.fromHex("#a5d6ff") },
    comment: { fg: RGBA.fromHex("#8b949e"), italic: true },
    number: { fg: RGBA.fromHex("#79c0ff") },
    function: { fg: RGBA.fromHex("#d2a8ff") },
    type: { fg: RGBA.fromHex("#ffa657") },
    operator: { fg: RGBA.fromHex("#ffb86b") },
    variable: { fg: RGBA.fromHex(palette.text) },
    property: { fg: RGBA.fromHex("#79c0ff") },
    constant: { fg: RGBA.fromHex("#79c0ff") },
    tag: { fg: RGBA.fromHex("#7ee787") },
    attribute: { fg: RGBA.fromHex("#d2a8ff") },
    "punctuation.bracket": { fg: RGBA.fromHex("#c9d1d9") },
    "punctuation.delimiter": { fg: RGBA.fromHex("#c9d1d9") },
    "punctuation.special": { fg: RGBA.fromHex("#8b949e") },
    default: { fg: RGBA.fromHex(palette.text) },
  });
}

function buildCodeBlockSyntax(_palette: typeof PALETTE) {
  return SyntaxStyle.fromStyles({
    keyword: { fg: RGBA.fromHex("#c9b37e"), bold: true },
    string: { fg: RGBA.fromHex("#9ab37f") },
    comment: { fg: RGBA.fromHex("#6f6f6f"), italic: true },
    number: { fg: RGBA.fromHex("#b8a07a") },
    function: { fg: RGBA.fromHex("#c7c7c7") },
    type: { fg: RGBA.fromHex("#b3aaa0") },
    operator: { fg: RGBA.fromHex("#a8a8a8") },
    variable: { fg: RGBA.fromHex("#d0d0d0") },
    property: { fg: RGBA.fromHex("#bbbbbb") },
    constant: { fg: RGBA.fromHex("#c4c4c4") },
    tag: { fg: RGBA.fromHex("#c9b37e") },
    attribute: { fg: RGBA.fromHex("#b3aaa0") },
    "punctuation.bracket": { fg: RGBA.fromHex("#9a9a9a") },
    "punctuation.delimiter": { fg: RGBA.fromHex("#8a8a8a") },
    "punctuation.special": { fg: RGBA.fromHex("#7c7c7c") },
    default: { fg: RGBA.fromHex("#d0d0d0") },
  });
}

let MESSAGE_MARKDOWN_SYNTAX = buildMessageMarkdownSyntax(PALETTE);
let DIFF_SYNTAX = buildDiffSyntax(PALETTE);
let CODE_BLOCK_SYNTAX = buildCodeBlockSyntax(PALETTE);
function nowIso(): string {
  return new Date().toISOString();
}

function basename(input: string): string {
  const base = path.basename(input);
  return base.length > 0 ? base : input;
}

function expandUserPath(input: string, homeDir: string): string {
  if (input === "~") return homeDir;
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(homeDir, input.slice(2));
  }
  return input;
}

function normalizeWorkspaceRoot(input: string, homeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return path.resolve(expandUserPath(trimmed, homeDir));
}

function scoreDirectorySuggestion(candidate: string, query: string): number {
  const candidateName = path.basename(candidate).toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  if (candidate.toLowerCase() === normalizedQuery) return 5;
  if (candidateName === normalizedQuery) return 4;
  if (candidateName.startsWith(normalizedQuery)) return 3;
  if (candidate.toLowerCase().includes(normalizedQuery)) return 2;
  return 1;
}

async function listDirectorySuggestions(input: string, homeDir: string): Promise<string[]> {
  const trimmed = input.trim();
  const expanded = expandUserPath(trimmed, homeDir);
  const targetPath = trimmed ? path.resolve(expanded) : process.cwd();
  const searchingWithinDirectory = /[\\/]$/.test(expanded);
  const searchRoot = searchingWithinDirectory ? targetPath : path.dirname(targetPath);
  const query = searchingWithinDirectory ? "" : path.basename(targetPath).toLowerCase();

  try {
    const entries = await fs.readdir(searchRoot, { withFileTypes: true });
    const directories = await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) return path.join(searchRoot, entry.name);
        if (!entry.isSymbolicLink()) return null;
        const candidatePath = path.join(searchRoot, entry.name);
        try {
          const stat = await fs.stat(candidatePath);
          return stat.isDirectory() ? candidatePath : null;
        } catch {
          return null;
        }
      }),
    );

    return directories
      .filter((candidate): candidate is string => candidate !== null)
      .filter((candidate) => (query ? candidate.toLowerCase().includes(query) : true))
      .toSorted((left, right) => {
        const byScore =
          scoreDirectorySuggestion(right, query) - scoreDirectorySuggestion(left, query);
        if (byScore !== 0) return byScore;
        return left.localeCompare(right);
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function copyTextToClipboard(value: string): Promise<void> {
  const commands =
    process.platform === "darwin"
      ? [["pbcopy"]]
      : process.platform === "linux"
        ? [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]]
        : [];

  if (commands.length === 0) {
    throw new Error(`Clipboard copy is not supported on ${process.platform}.`);
  }

  let lastError: Error | null = null;
  for (const command of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command[0]!, command.slice(1), {
          stdio: ["pipe", "ignore", "pipe"],
        });

        let stderr = "";
        child.on("error", (error) => {
          reject(error);
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() || `Clipboard helper exited with code ${code ?? -1}.`));
        });
        child.stdin?.end(value);
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("No clipboard helper was available.");
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs)) return "";
  const minutes = Math.max(Math.floor(diffMs / 60_000), 0);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const timestampFormatterCache = new Map<TimestampFormat, Intl.DateTimeFormat>();

function getTimestampFormatter(timestampFormat: TimestampFormat): Intl.DateTimeFormat {
  const cached = timestampFormatterCache.get(timestampFormat);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(timestampFormat === "locale" ? {} : { hour12: timestampFormat === "12-hour" }),
  });
  timestampFormatterCache.set(timestampFormat, formatter);
  return formatter;
}

function formatMessageTimestamp(
  iso: string | null | undefined,
  timestampFormat: TimestampFormat = DEFAULT_TIMESTAMP_FORMAT,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return getTimestampFormatter(timestampFormat).format(date);
}

function providerIcon(provider: ProviderKind | string | null | undefined): string {
  return provider === "claudeAgent" ? "✱" : "󰚩";
}

function providerPickerIcon(provider: string): string {
  if (provider === "claudeAgent") return "✱";
  if (provider === "cursor") return "⌖";
  if (provider === "opencode") return "⌘";
  if (provider === "gemini") return "◇";
  return "󰚩";
}

function providerColor(provider: ProviderKind | string | null | undefined): string {
  return provider === "claudeAgent" ? PALETTE.claude : PALETTE.muted;
}

function interactionLabel(mode: "default" | "plan"): string {
  return mode === "plan" ? "Plan" : "Chat";
}

function interactionIcon(mode: "default" | "plan"): string {
  return mode === "plan" ? "󰨖" : "󰍩";
}

function modelControlLabel(provider: ProviderKind, model: string): string {
  const resolvedModel =
    resolveSelectableModel(provider, model, MODEL_OPTIONS_BY_PROVIDER[provider]) ?? model;

  if (provider === "codex") {
    return resolveModelName(provider, resolvedModel);
  } else {
    if (resolvedModel === "claude-opus-4-6") return "Opus 4.6";
    if (resolvedModel === "claude-sonnet-4-6") return "Sonnet 4.6";
    if (resolvedModel === "claude-haiku-4-5") return "Haiku 4.5";
  }

  return resolveModelName(provider, resolvedModel)
    .replace(/^GPT-/i, "GPT ")
    .replace(/-codex$/i, "")
    .replace(/^Claude\s+/i, "")
    .replace(/\s+Codex(?:\s+Spark)?$/i, "")
    .trim();
}

function getCodexTraits(modelOptions: ProviderModelOptions | null | undefined): {
  effort: CodexReasoningEffort | "none";
  fastModeEnabled: boolean;
} {
  const defaultReasoningEffort = getDefaultReasoningEffort("codex");
  const rawReasoningEffort =
    typeof modelOptions?.codex?.reasoningEffort === "string"
      ? (modelOptions.codex.reasoningEffort as CodexReasoningEffort | "none")
      : null;
  return {
    effort:
      resolveReasoningEffortForProvider("codex", rawReasoningEffort) ??
      (rawReasoningEffort === "none" ? "none" : null) ??
      defaultReasoningEffort,
    fastModeEnabled: modelOptions?.codex?.fastMode === true,
  };
}

function getClaudeTraits(
  model: string,
  prompt: string,
  modelOptions: ProviderModelOptions | null | undefined,
): {
  effort: Exclude<ClaudeCodeEffort, "ultrathink"> | null;
  thinkingEnabled: boolean | null;
  fastModeEnabled: boolean;
  options: ReadonlyArray<ClaudeCodeEffort>;
  ultrathinkPromptControlled: boolean;
  supportsFastMode: boolean;
} {
  const options = getReasoningEffortOptions("claudeAgent", model);
  const defaultReasoningEffort = getDefaultReasoningEffort("claudeAgent") as Exclude<
    ClaudeCodeEffort,
    "ultrathink"
  >;
  const resolvedEffort = resolveReasoningEffortForProvider(
    "claudeAgent",
    modelOptions?.claudeAgent?.effort,
  );
  const effort =
    resolvedEffort && resolvedEffort !== "ultrathink" && options.includes(resolvedEffort)
      ? resolvedEffort
      : options.includes(defaultReasoningEffort)
        ? defaultReasoningEffort
        : null;
  const thinkingEnabled = supportsClaudeThinkingToggle(model)
    ? (modelOptions?.claudeAgent?.thinking ?? true)
    : null;
  const supportsFastMode = supportsClaudeFastMode(model);

  return {
    effort,
    thinkingEnabled,
    fastModeEnabled: supportsFastMode && modelOptions?.claudeAgent?.fastMode === true,
    options,
    ultrathinkPromptControlled:
      supportsClaudeUltrathinkKeyword(model) && isClaudeUltrathinkPrompt(prompt),
    supportsFastMode,
  };
}

function composerTraitsLabel(
  provider: ProviderKind,
  model: string,
  prompt: string,
  modelOptions: ProviderModelOptions | null | undefined,
): string | null {
  if (provider === "codex") {
    const { effort, fastModeEnabled } = getCodexTraits(modelOptions);
    return [formatReasoningEffortLabel(effort), ...(fastModeEnabled ? ["Fast"] : [])].join(" · ");
  }

  const { effort, thinkingEnabled, fastModeEnabled, ultrathinkPromptControlled, supportsFastMode } =
    getClaudeTraits(model, prompt, modelOptions);
  const label = [
    ultrathinkPromptControlled
      ? "Ultrathink"
      : effort
        ? formatReasoningEffortLabel(effort)
        : thinkingEnabled === null
          ? null
          : `Thinking ${thinkingEnabled ? "On" : "Off"}`,
    ...(supportsFastMode && fastModeEnabled ? ["Fast"] : []),
  ]
    .filter(Boolean)
    .join(" · ");
  return label || null;
}

function getDispatchModelOptions(
  provider: ProviderKind,
  model: string,
  modelOptions: ProviderModelOptions | null | undefined,
): ProviderModelOptions | undefined {
  if (provider === "codex") {
    const normalized = normalizeCodexModelOptions(modelOptions?.codex);
    return normalized ? { codex: normalized } : undefined;
  }
  const normalized = normalizeClaudeModelOptions(model, modelOptions?.claudeAgent);
  return normalized ? { claudeAgent: normalized } : undefined;
}

function resolveModelName(provider: ProviderKind, model: string): string {
  return MODEL_OPTIONS_BY_PROVIDER[provider].find((option) => option.slug === model)?.name ?? model;
}

function runtimeFooterLabel(mode: RuntimeMode): string {
  return mode === "full-access" ? "Full access" : "Approval";
}

function runtimeFooterIcon(mode: RuntimeMode): string {
  return mode === "full-access" ? "󰌾" : "󰌽";
}

function gitMenuItemIcon(item: Pick<GitActionMenuItem, "icon">): string {
  if (item.icon === "commit") return "󰜘";
  if (item.icon === "push") return "󰊤";
  return "󰙯";
}

function summarizeGitActionResult(
  action: GitStackedAction,
  result: {
    commit: { status: string; commitSha?: string | undefined };
    push: { status: string };
    pr: { status: string; number?: number | undefined };
  },
): string {
  if (result.pr.status === "created" || result.pr.status === "opened_existing") {
    return result.pr.number ? `PR #${result.pr.number}` : "PR ready";
  }
  if (result.push.status === "pushed") {
    return "Pushed";
  }
  if (result.commit.status === "created") {
    return result.commit.commitSha
      ? `Committed ${result.commit.commitSha.slice(0, 7)}`
      : "Committed";
  }
  if (action === "commit_push") return "Push complete";
  if (action === "commit_push_pr") return "PR flow complete";
  return "Commit complete";
}

function basenameOfPath(input: string): string {
  const trimmed = input.replace(/\/+$/g, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || input;
}

function inferMentionKindFromPath(pathValue: string): ProjectEntry["kind"] {
  return basenameOfPath(pathValue).includes(".") ? "file" : "directory";
}

function mentionLabel(mention: Pick<ComposerMention, "path" | "kind">): string {
  const icon = mention.kind === "directory" ? "󰉋" : "󰈔";
  return `${icon} ${basenameOfPath(mention.path)}`;
}

function mentionSignature(mention: Pick<ComposerMention, "path">): string {
  return mention.path;
}

const MENTION_TOKEN_PATTERN = /(^|\s)@([^\s@]+)(?=\s|$)/g;

function detectTrailingComposerPathTrigger(input: string): ComposerPathTrigger | null {
  const trimmedEnd = input.replace(/\r/g, "");
  const cursor = trimmedEnd.length;
  let index = cursor - 1;
  while (index >= 0) {
    const char = trimmedEnd[index] ?? "";
    if (char === " " || char === "\n" || char === "\t") {
      break;
    }
    index -= 1;
  }
  const rangeStart = index + 1;
  const token = trimmedEnd.slice(rangeStart, cursor);
  if (!token.startsWith("@")) {
    return null;
  }
  return {
    query: token.slice(1),
    rangeStart,
    rangeEnd: cursor,
  };
}

function replaceComposerTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): string {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd));
  return `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`;
}

function stripMentionTokensFromText(input: string): {
  mentions: ComposerMention[];
  body: string;
} {
  const mentions: ComposerMention[] = [];
  let cursor = 0;
  let output = "";

  for (const match of input.matchAll(MENTION_TOKEN_PATTERN)) {
    const fullMatch = match[0] ?? "";
    const prefix = match[1] ?? "";
    const mentionPath = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const mentionStart = matchIndex + prefix.length;
    const mentionEnd = mentionStart + fullMatch.length - prefix.length;
    output += input.slice(cursor, mentionStart);
    if (mentionPath.length > 0) {
      mentions.push({
        type: "path",
        path: mentionPath,
        kind: inferMentionKindFromPath(mentionPath),
      });
    } else {
      output += input.slice(mentionStart, mentionEnd);
    }
    cursor = mentionEnd;
  }

  output += input.slice(cursor);
  const body = output
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { mentions, body };
}

function composerTraitsIcon(provider: ProviderKind): string {
  return provider === "claudeAgent" ? "󰚩" : "󰔟";
}

function buildTemporaryWorktreeBranchName(): string {
  return `${WORKTREE_BRANCH_PREFIX}/${randomUUID().slice(0, 8).toLowerCase()}`;
}

function createDefaultDraftThreadState(
  projectId: string,
  envMode: ThreadEnvMode,
  branch: string | null = null,
): DraftThreadState {
  return {
    id: `${DRAFT_THREAD_ID_PREFIX}${newThreadId()}`,
    projectId,
    branch,
    worktreePath: null,
    envMode,
  };
}

function resolveEffectiveThreadEnvMode(input: {
  activeWorktreePath: string | null;
  hasServerThread: boolean;
  draftThreadEnvMode: ThreadEnvMode | undefined;
  fallbackEnvMode: ThreadEnvMode;
}): ThreadEnvMode {
  const { activeWorktreePath, hasServerThread, draftThreadEnvMode, fallbackEnvMode } = input;
  return activeWorktreePath || (!hasServerThread && draftThreadEnvMode === "worktree")
    ? "worktree"
    : (draftThreadEnvMode ?? fallbackEnvMode);
}

function resolveDraftEnvModeAfterBranchChange(input: {
  nextWorktreePath: string | null;
  currentWorktreePath: string | null;
  effectiveEnvMode: ThreadEnvMode;
}): ThreadEnvMode {
  const { nextWorktreePath, currentWorktreePath, effectiveEnvMode } = input;
  if (nextWorktreePath) {
    return "worktree";
  }
  if (effectiveEnvMode === "worktree" && !currentWorktreePath) {
    return "worktree";
  }
  return "local";
}

function resolveComposerBranchValue(input: {
  envMode: ThreadEnvMode;
  activeWorktreePath: string | null;
  activeThreadBranch: string | null;
  currentGitBranch: string | null;
}): string | null {
  const { envMode, activeWorktreePath, activeThreadBranch, currentGitBranch } = input;
  if (envMode === "worktree" && !activeWorktreePath) {
    return activeThreadBranch ?? currentGitBranch;
  }
  return currentGitBranch ?? activeThreadBranch;
}

function deriveLocalBranchNameFromRemoteRef(branchName: string): string {
  const firstSeparatorIndex = branchName.indexOf("/");
  if (firstSeparatorIndex <= 0 || firstSeparatorIndex === branchName.length - 1) {
    return branchName;
  }
  return branchName.slice(firstSeparatorIndex + 1);
}

function deriveLocalBranchNameCandidatesFromRemoteRef(
  branchName: string,
  remoteName?: string,
): ReadonlyArray<string> {
  const candidates = new Set<string>();
  const firstSlashCandidate = deriveLocalBranchNameFromRemoteRef(branchName);
  if (firstSlashCandidate.length > 0) {
    candidates.add(firstSlashCandidate);
  }

  if (remoteName) {
    const remotePrefix = `${remoteName}/`;
    if (branchName.startsWith(remotePrefix) && branchName.length > remotePrefix.length) {
      candidates.add(branchName.slice(remotePrefix.length));
    }
  }

  return [...candidates];
}

function dedupeRemoteBranchesWithLocalMatches(
  branches: ReadonlyArray<GitListBranchesResult["branches"][number]>,
): ReadonlyArray<GitListBranchesResult["branches"][number]> {
  const localBranchNames = new Set(
    branches.filter((branch) => !branch.isRemote).map((branch) => branch.name),
  );

  return branches.filter((branch) => {
    if (!branch.isRemote) {
      return true;
    }
    if (branch.remoteName !== "origin") {
      return true;
    }
    const localBranchCandidates = deriveLocalBranchNameCandidatesFromRemoteRef(
      branch.name,
      branch.remoteName,
    );
    return !localBranchCandidates.some((candidate) => localBranchNames.has(candidate));
  });
}

function resolveBranchSelectionTarget(input: {
  activeProjectCwd: string;
  activeWorktreePath: string | null;
  branch: Pick<GitListBranchesResult["branches"][number], "isDefault" | "worktreePath">;
}): {
  checkoutCwd: string;
  nextWorktreePath: string | null;
  reuseExistingWorktree: boolean;
} {
  const { activeProjectCwd, activeWorktreePath, branch } = input;

  if (branch.worktreePath) {
    return {
      checkoutCwd: branch.worktreePath,
      nextWorktreePath: branch.worktreePath === activeProjectCwd ? null : branch.worktreePath,
      reuseExistingWorktree: true,
    };
  }

  const nextWorktreePath =
    activeWorktreePath !== null && branch.isDefault ? null : activeWorktreePath;

  return {
    checkoutCwd: nextWorktreePath ?? activeProjectCwd,
    nextWorktreePath,
    reuseExistingWorktree: false,
  };
}

function branchTriggerLabel(input: {
  activeWorktreePath: string | null;
  effectiveEnvMode: ThreadEnvMode;
  branch: string | null;
}): string {
  const { activeWorktreePath, effectiveEnvMode, branch } = input;
  if (!branch) {
    return "Select branch";
  }
  if (effectiveEnvMode === "worktree" && !activeWorktreePath) {
    return `From ${branch}`;
  }
  return branch;
}

function resolveThreadGitSyncKey(
  thread: Pick<ThreadReadModel, "updatedAt" | "branch" | "worktreePath"> | null,
): string | null {
  if (!thread) {
    return null;
  }
  return `${thread.updatedAt}:${thread.branch ?? ""}:${thread.worktreePath ?? ""}`;
}

function resolvePreferredEditor(availableEditors: readonly EditorId[]): EditorId | null {
  return availableEditors[0] ?? null;
}

function renderMessageBody(entry: TimelineEntry): string {
  if (entry.kind === "message") {
    return entry.message.text || " ";
  }
  if (entry.kind === "proposed-plan") {
    return entry.proposedPlan.planMarkdown;
  }
  return workEntryDisplayText(entry.entry);
}

function attachmentSignature(attachment: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;
  id?: string;
}): string {
  if (attachment.id) {
    return `id::${attachment.id}`;
  }
  return [
    "draft",
    attachment.mimeType,
    String(attachment.sizeBytes),
    attachment.dataUrl ?? "",
  ].join("::");
}

function mergeChatAttachments<T extends ComposerImageAttachment>(
  ...attachmentLists: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const attachments of attachmentLists) {
    for (const attachment of attachments) {
      const signature = attachmentSignature(attachment);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      merged.push(attachment);
    }
  }
  return merged;
}

const ATTACHMENT_PILL_TONES = [
  { backgroundColor: "#1d2026", textColor: "#3b82f6" },
  { backgroundColor: "#241b2f", textColor: "#a78bfa" },
  { backgroundColor: "#2a2417", textColor: "#facc15" },
  { backgroundColor: "#2a1b1b", textColor: "#f87171" },
  { backgroundColor: "#1c2721", textColor: "#34d399" },
  { backgroundColor: "#272019", textColor: "#fb923c" },
];

function resolveAttachmentPillTone(index: number) {
  return ATTACHMENT_PILL_TONES[index % ATTACHMENT_PILL_TONES.length] ?? ATTACHMENT_PILL_TONES[0]!;
}

function resolveHttpOriginFromWsUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    return `${protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function AttachmentPill({
  label = "󰋩 Image",
  toneIndex = 0,
  align = "flex-start",
  onPress,
  colors,
}: {
  label?: string;
  toneIndex?: number;
  align?: "flex-start" | "flex-end";
  onPress?: () => void;
  colors?: {
    backgroundColor: string;
    textColor: string;
  };
}) {
  const tone = colors ?? resolveAttachmentPillTone(toneIndex);
  return (
    <box
      onMouseDown={(event) => {
        if (!onPress) return;
        event.preventDefault();
        event.stopPropagation?.();
        onPress();
      }}
      style={{
        backgroundColor: tone.backgroundColor,
        paddingLeft: 1,
        paddingRight: 1,
        height: 1,
        marginRight: 1,
        alignSelf: align,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <text content={label} style={{ fg: tone.textColor }} />
    </box>
  );
}

function PathSuggestionRow(props: {
  entry: ProjectEntry;
  active?: boolean;
  onHover?: () => void;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = props.active || hovered;
  return (
    <box
      onMouseOver={() => {
        setHovered(true);
        props.onHover?.();
      }}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation?.();
        props.onPress();
      }}
      style={{
        backgroundColor: active ? PALETTE.controlActive : PALETTE.surfaceAlt,
        paddingLeft: 1,
        paddingRight: 1,
        height: 1,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <text
        content={mentionLabel({
          path: props.entry.path,
          kind: props.entry.kind,
        })}
        style={{ fg: active ? PALETTE.text : PALETTE.muted, marginRight: 1 }}
      />
      <box style={{ flexGrow: 1 }} />
      <box style={{ width: 44, flexShrink: 1, overflow: "hidden", height: 1 }}>
        <text content={props.entry.parentPath ?? ""} style={{ fg: PALETTE.subtle }} />
      </box>
    </box>
  );
}

function MessageMentions(props: {
  mentions: readonly ComposerMention[];
  align?: "flex-start" | "flex-end";
}) {
  if (props.mentions.length === 0) {
    return null;
  }

  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: props.align ?? "flex-start",
        flexWrap: "wrap",
        marginBottom: 1,
      }}
    >
      {props.mentions.map((mention, index) => (
        <AttachmentPill
          key={mentionSignature(mention)}
          label={mentionLabel(mention)}
          toneIndex={index}
          align={props.align ?? "flex-start"}
        />
      ))}
    </box>
  );
}

function MessageAttachments({
  attachments,
  align = "flex-start",
  onOpen,
}: {
  attachments: readonly ComposerImageAttachment[];
  align?: "flex-start" | "flex-end";
  onOpen?: (attachment: ComposerImageAttachment) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: align,
        marginBottom: 1,
      }}
    >
      {attachments.map((attachment, index) => (
        <AttachmentPill
          key={attachmentSignature(attachment)}
          label="󰋩 Image"
          toneIndex={index}
          align={align}
          {...(onOpen
            ? {
                onPress: () => {
                  onOpen(attachment);
                },
              }
            : {})}
        />
      ))}
    </box>
  );
}

export function MessageMarkdown({
  content,
  color = PALETTE.text,
  fillWidth = true,
  onCopyCodeBlock,
}: {
  content: string;
  color?: string;
  fillWidth?: boolean;
  onCopyCodeBlock?: (value: string) => void;
}) {
  const segments = useMemo(() => parseMessageMarkdownSegments(content), [content]);

  if (!segments.some((segment) => segment.kind === "code")) {
    return (
      <markdown
        content={content}
        syntaxStyle={MESSAGE_MARKDOWN_SYNTAX}
        conceal={true}
        style={{
          width: fillWidth ? "100%" : "auto",
          minWidth: 0,
          flexShrink: 0,
          fg: color,
          ...(fillWidth ? {} : { maxWidth: "100%" as const }),
        }}
      />
    );
  }

  return (
    <box
      style={{
        width: fillWidth ? "100%" : "auto",
        minWidth: 0,
        flexShrink: 1,
        flexDirection: "column",
        ...(fillWidth ? {} : { maxWidth: "100%" as const }),
      }}
    >
      {segments.map((segment, index) => {
        const marginBottom = index < segments.length - 1 ? 1 : 0;

        if (segment.kind === "markdown") {
          const segmentKey = `${segment.kind}:${segment.content}`;
          if (!segment.content.trim()) {
            return <box key={`${segmentKey}:spacer`} style={{ height: marginBottom }} />;
          }

          return (
            <markdown
              key={segmentKey}
              content={segment.content}
              syntaxStyle={MESSAGE_MARKDOWN_SYNTAX}
              conceal={true}
              style={{
                width: fillWidth ? "100%" : "auto",
                minWidth: 0,
                flexShrink: 0,
                fg: color,
                marginBottom,
                ...(fillWidth ? {} : { maxWidth: "100%" as const }),
              }}
            />
          );
        }

        const segmentKey = `${segment.kind}:${segment.language ?? ""}:${segment.content}`;
        const displayedCode = truncateCodeBlockContent(segment.content);
        const codeBlockFiletype = resolveCodeBlockFiletype(segment.language);
        const codeBlockSyntax = isDiffLikeCodeBlockFiletype(codeBlockFiletype)
          ? DIFF_SYNTAX
          : CODE_BLOCK_SYNTAX;
        return (
          <box
            key={segmentKey}
            style={{
              width: "auto",
              minWidth: 0,
              maxWidth: "85%",
              flexDirection: "column",
              marginBottom,
            }}
          >
            <box
              style={{
                width: "auto",
                minWidth: 0,
                flexDirection: "column",
                backgroundColor: "#101010",
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 0,
                paddingBottom: 0,
              }}
            >
              {segment.language ? (
                <text content={segment.language} style={{ fg: "#8a8a8a" }} />
              ) : null}
              <code
                content={displayedCode || " "}
                {...(codeBlockFiletype ? { filetype: codeBlockFiletype } : {})}
                syntaxStyle={codeBlockSyntax}
                conceal={true}
                style={{
                  width: "auto",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              />
              {onCopyCodeBlock ? (
                <box
                  style={{
                    width: "100%",
                    minWidth: 0,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                  }}
                >
                  <box
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation?.();
                      onCopyCodeBlock(segment.content);
                    }}
                    style={{
                      width: "auto",
                      minWidth: 0,
                      paddingLeft: 0,
                      paddingRight: 0,
                      height: 1,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <text content="󰆏" style={{ fg: "#9a9a9a" }} />
                  </box>
                </box>
              ) : null}
            </box>
          </box>
        );
      })}
    </box>
  );
}

function summarizeDiffPatch(patch: string): {
  addedLines: number;
  removedLines: number;
} {
  let addedLines = 0;
  let removedLines = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      continue;
    }
    if (line.startsWith("+")) {
      addedLines++;
      continue;
    }
    if (line.startsWith("-")) {
      removedLines++;
    }
  }

  return { addedLines, removedLines };
}

function normalizePatchForOpenTuiDiff(patch: string): string {
  const lines = patch
    .trimEnd()
    .split("\n")
    .filter((line) => !OPEN_TUI_DIFF_METADATA_PREFIXES.some((prefix) => line.startsWith(prefix)));
  const normalizedLines: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const hunkMatch = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/.exec(line);
    if (!hunkMatch) {
      normalizedLines.push(line);
      continue;
    }

    const oldStart = Number(hunkMatch[1]);
    const newStart = Number(hunkMatch[3]);
    let oldCount = 0;
    let newCount = 0;

    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const bodyLine = lines[cursor] ?? "";
      if (bodyLine.startsWith("@@ ")) {
        break;
      }
      if (bodyLine.startsWith("-")) {
        oldCount++;
        continue;
      }
      if (bodyLine.startsWith("+")) {
        newCount++;
        continue;
      }
      if (bodyLine.startsWith(" ")) {
        oldCount++;
        newCount++;
      }
    }

    normalizedLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${hunkMatch[5]}`);
  }

  return normalizedLines.join("\n");
}

function parseDiffFiles(diffText: string): ParsedDiffFile[] {
  const normalized = diffText.trim();
  if (normalized.length === 0) {
    return [];
  }

  const lines = normalized.split("\n");
  const files: ParsedDiffFile[] = [];
  let currentLines: string[] = [];
  let currentPath: string | null = null;
  let fallbackIndex = 0;

  function commitCurrentFile() {
    if (currentLines.length === 0) {
      return;
    }

    const patch = normalizePatchForOpenTuiDiff(currentLines.join("\n"));
    const filePath = currentPath ?? `diff-${fallbackIndex + 1}`;
    const { addedLines, removedLines } = summarizeDiffPatch(patch);
    const filetype = pathToFiletype(filePath);

    files.push({
      key: `${filePath}:${fallbackIndex}`,
      filePath,
      patch,
      addedLines,
      removedLines,
      ...(filetype ? { filetype } : {}),
    });

    fallbackIndex++;
    currentLines = [];
    currentPath = null;
  }

  for (const line of lines) {
    const diffGitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (diffGitMatch) {
      commitCurrentFile();
      currentPath = diffGitMatch[2] ?? diffGitMatch[1] ?? null;
    } else if (line.startsWith("+++ ")) {
      const nextPath = line.slice(4).trim();
      if (nextPath !== "/dev/null") {
        currentPath = nextPath.replace(/^b\//, "");
      }
    } else if (line.startsWith("--- ")) {
      const previousPath = line.slice(4).trim();
      if (!currentPath && previousPath !== "/dev/null") {
        currentPath = previousPath.replace(/^a\//, "");
      }
    }

    currentLines.push(line);
  }

  commitCurrentFile();
  return files;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

function toolWorkEntryHeading(entry: Extract<TimelineEntry, { kind: "work" }>["entry"]): string {
  if (entry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(entry.toolTitle));
  }
  return capitalizePhrase(normalizeCompactToolLabel(entry.label));
}

function workEntryPreview(entry: Extract<TimelineEntry, { kind: "work" }>["entry"]): string | null {
  if (entry.command) return entry.command;
  if (entry.detail) return entry.detail;
  if ((entry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = entry.changedFiles ?? [];
  if (!firstPath) return null;
  return entry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${entry.changedFiles!.length - 1} more`;
}

function workEntryDisplayText(entry: Extract<TimelineEntry, { kind: "work" }>["entry"]): string {
  const heading = toolWorkEntryHeading(entry);
  const preview = workEntryPreview(entry);
  return preview ? `${heading} - ${preview}` : heading;
}

function workEntryPrefix(entry: Extract<TimelineEntry, { kind: "work" }>["entry"]): string {
  return resolveWorkEntryIcon(entry);
}

function workEntryAccent(entry: Extract<TimelineEntry, { kind: "work" }>["entry"]): string {
  if (entry.tone === "error") return "#fda4af";
  if (entry.requestKind === "command" || entry.command) return PALETTE.text;
  if (entry.requestKind === "file-change" || (entry.changedFiles?.length ?? 0) > 0) {
    return PALETTE.info;
  }
  if (entry.requestKind === "file-read" || entry.itemType === "image_view") {
    return PALETTE.muted;
  }
  return PALETTE.subtle;
}

type ThreadSidebarStatus = {
  label: ThreadStatusPill["label"];
  dotColor: string;
  pulse: boolean;
};

function resolveThreadStatusColor(label: ThreadStatusPill["label"]): string {
  switch (label) {
    case "Pending Approval":
      return PALETTE.warning;
    case "Awaiting Input":
      return "#818cf8";
    case "Working":
    case "Connecting":
      return "#7dd3fc";
    case "Plan Ready":
      return "#a78bfa";
    case "Completed":
      return PALETTE.success;
  }
}

function resolveThreadStatusPillForTui(
  thread: ThreadReadModel,
  options: { forceUnread?: boolean; locallyVisitedAt: string | undefined } = {
    locallyVisitedAt: undefined,
  },
): ThreadStatusPill | null {
  return resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt: options.forceUnread ? undefined : options.locallyVisitedAt,
      session:
        thread.session?.status === "starting"
          ? { ...thread.session, status: "connecting" }
          : thread.session,
    },
    hasPendingApprovals: derivePendingApprovals(thread.activities).length > 0,
    hasPendingUserInput: derivePendingUserInputs(thread.activities).length > 0,
  });
}

function threadStatus(
  thread: ThreadReadModel,
  options: { forceUnread?: boolean; locallyVisitedAt: string | undefined } = {
    locallyVisitedAt: undefined,
  },
): ThreadSidebarStatus | null {
  const statusPill = resolveThreadStatusPillForTui(thread, options);
  if (!statusPill) return null;
  return {
    label: statusPill.label,
    dotColor: resolveThreadStatusColor(statusPill.label),
    pulse: statusPill.pulse,
  };
}

function resolveThreadStatusDotColor(status: ThreadSidebarStatus, tick: number): string {
  if (!status.pulse) return status.dotColor;
  return tick % 2 === 0 ? status.dotColor : "#3b82f6";
}

function approvalHint(approval: ReturnType<typeof derivePendingApprovals>[number]): string {
  const detail = approval.detail?.trim();
  if (!detail) {
    return `󰳦 ${approval.requestKind} · /approve accept`;
  }
  return `󰳦 ${approval.requestKind} · ${detail}`;
}

function userInputHint(input: ReturnType<typeof derivePendingUserInputs>[number]): string {
  const questions = input.questions.map((question) => question.id).join(" · ");
  return `󰞋 ${questions || "answer needed"}`;
}

function planHint(): string {
  return "󱞁 plan ready";
}

function normalizeApprovalDecision(value: string): ProviderApprovalDecision | null {
  switch (value.trim().toLowerCase()) {
    case "accept":
    case "approve":
    case "once":
      return "accept";
    case "acceptforsession":
    case "accept-for-session":
    case "always":
      return "acceptForSession";
    case "decline":
    case "deny":
    case "reject":
      return "decline";
    case "cancel":
    case "abort":
      return "cancel";
    default:
      return null;
  }
}

function normalizeInteractionModeArg(value: string): ProviderInteractionMode | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "default" || normalized === "chat") {
    return "default";
  }
  if (normalized === "plan") {
    return "plan";
  }
  return null;
}

function parsePendingUserInputAnswerArgs(args: string): Record<string, string> | null {
  const pairs = args
    .trim()
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (pairs.length === 0) {
    return null;
  }

  const answers: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      return null;
    }
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      return null;
    }
    answers[key] = value;
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

const SIDEBAR_THREAD_TIMESTAMP_WIDTH = 4;
const SIDEBAR_TREE_INDENT_WIDTH = 1;
const SIDEBAR_ROW_HORIZONTAL_PADDING = 2;
const SIDEBAR_THREAD_STATUS_WIDTH = 2;
const SIDEBAR_THREAD_TIMESTAMP_GAP = 1;
const SIDEBAR_THREAD_LAYOUT_BUFFER = 1;
const HEADER_THREAD_TITLE_MAX_LENGTH = 44;
const COMPOSER_TEXTAREA_MIN_HEIGHT = 3;
const COMPOSER_TEXTAREA_MAX_HEIGHT = 8;
const COMPOSER_PATH_SUGGESTION_MAX_ITEMS = 5;
const SEND_ANIMATION_INTERVAL_MS = 90;
const SEND_PLACEHOLDER_MIN_DURATION_MS = 650;
const SEND_DOT_IDLE_COLOR = "#6b7280";
const SEND_DOT_ACTIVE_COLOR = "#d1d5db";
const SIDEBAR_STATUS_PULSE_INTERVAL_MS = 260;
const SIDEBAR_THREAD_TITLE_WIDTH =
  TUI_SIDEBAR_WIDTH -
  SIDEBAR_TREE_INDENT_WIDTH -
  SIDEBAR_ROW_HORIZONTAL_PADDING -
  SIDEBAR_THREAD_STATUS_WIDTH -
  SIDEBAR_THREAD_TIMESTAMP_GAP -
  SIDEBAR_THREAD_TIMESTAMP_WIDTH -
  SIDEBAR_THREAD_LAYOUT_BUFFER;
const COMPOSER_PLACEHOLDER = "Ask anything or @tag files/folders";
const POPUP_MENU_WIDTH = 32;
const MODEL_POPUP_WIDTH = 58;
const MODEL_POPUP_PROVIDER_COLUMN_WIDTH = 22;
const POPUP_TRAITS_MENU_BASE_HEIGHT = 4;
const POPUP_FALLBACK_RIGHT_OFFSET = 2;
const TIMELINE_SCROLL_BOTTOM_THRESHOLD_ROWS = 4;

function isAvailableModelProviderOption(
  option: (typeof PROVIDER_OPTIONS)[number],
): option is (typeof PROVIDER_OPTIONS)[number] & {
  value: ProviderKind;
  available: true;
} {
  return option.available;
}

const AVAILABLE_MODEL_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableModelProviderOption);
const COMING_SOON_MODEL_PROVIDER_OPTIONS = [
  ...PROVIDER_OPTIONS.filter((option) => !option.available).map((option) => ({
    id: option.value,
    label: option.label,
  })),
  { id: "opencode", label: "OpenCode" },
  { id: "gemini", label: "Gemini" },
] as const;

function countDistinctSections(items: readonly TraitsMenuItem[]): number {
  let count = 0;
  let previousSection: string | null = null;
  for (const item of items) {
    if (item.section !== previousSection) {
      count += 1;
      previousSection = item.section;
    }
  }
  return count;
}

function resolvePopupPosition(input: {
  anchorX: number | null;
  anchorY: number | null;
  width: number;
  height: number;
  viewportColumns: number;
  viewportRows: number;
  fallbackLeft: number;
}): { top: number; left: number } {
  const left = Math.max(
    1,
    Math.min(
      input.anchorX !== null ? input.anchorX - 2 : input.fallbackLeft,
      input.viewportColumns - input.width - 1,
    ),
  );
  const top = Math.max(
    1,
    Math.min(
      input.anchorY !== null ? input.anchorY - input.height : 4,
      input.viewportRows - input.height - 1,
    ),
  );

  return { top, left };
}

function estimateWrappedLineCount(text: string, width: number): number {
  return text.split("\n").reduce((count, line) => {
    return count + Math.max(1, Math.ceil(Math.max(line.length, 1) / width));
  }, 0);
}

function estimateComposerTextareaHeight(input: {
  text: string;
  placeholder: string;
  totalColumns: number;
  sidebarWidth: number;
  showSidebar: boolean;
}): number {
  const mainColumns = input.totalColumns - input.sidebarWidth - (input.showSidebar ? 1 : 0);
  const composerInnerWidth = Math.max(24, mainColumns - 12);
  const content = input.text.length > 0 ? input.text : input.placeholder;
  return Math.max(
    COMPOSER_TEXTAREA_MIN_HEIGHT,
    Math.min(COMPOSER_TEXTAREA_MAX_HEIGHT, estimateWrappedLineCount(content, composerInnerWidth)),
  );
}

function normalizePersistedProvider(value: string | undefined): ProviderKind | null {
  return value === "codex" || value === "claudeAgent" ? value : null;
}

function normalizePersistedRuntimeMode(value: string | undefined): RuntimeMode | null {
  return value === "full-access" || value === "approval-required" ? value : null;
}

function normalizePersistedInteractionMode(value: string | undefined): "default" | "plan" | null {
  return value === "default" || value === "plan" ? value : null;
}

function resolvePersistedModel(provider: ProviderKind, model: string | undefined): string {
  return (
    resolveSelectableModel(provider, model, MODEL_OPTIONS_BY_PROVIDER[provider]) ??
    DEFAULT_MODEL_BY_PROVIDER[provider]
  );
}

function Badge(props: { label: string; tone?: "default" | "accent" | "warn" }) {
  let foreground = PALETTE.muted;
  let background = PALETTE.controlHover;
  if (props.tone === "accent") {
    foreground = PALETTE.accent;
    background = PALETTE.surfaceInfo;
  } else if (props.tone === "warn") {
    foreground = PALETTE.warning;
    background = PALETTE.surfaceWarn;
  }

  return (
    <box
      style={{
        backgroundColor: background,
        paddingLeft: 1,
        paddingRight: 1,
        marginLeft: 1,
        height: 1,
        justifyContent: "center",
      }}
    >
      <text content={props.label} style={{ fg: foreground }} />
    </box>
  );
}

function WindowDots() {
  return (
    <box style={{ flexDirection: "row", alignItems: "center", marginRight: 2 }}>
      <text content="●" style={{ fg: PALETTE.macRed, marginRight: 1 }} />
      <text content="●" style={{ fg: PALETTE.macYellow, marginRight: 1 }} />
      <text content="●" style={{ fg: PALETTE.macGreen, marginRight: 2 }} />
    </box>
  );
}

function renderAnimatedSendDots(
  tick: number,
): Array<{ key: string; character: string; color: string }> {
  const activeDot = tick % 3;
  return Array.from({ length: 3 }, (_, index) => ({
    key: `send-dot-${index}`,
    character: "•",
    color: index === activeDot ? SEND_DOT_ACTIVE_COLOR : SEND_DOT_IDLE_COLOR,
  }));
}

function SectionLabel(props: {
  label: string;
  actions?: ReadonlyArray<{
    icon: string;
    active?: boolean;
    onPress: (event?: SidebarMouseEvent) => void;
  }>;
}) {
  return (
    <box
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
      }}
    >
      <text content={props.label} style={{ fg: PALETTE.subtle, flexGrow: 1 }} />
      <box style={{ flexDirection: "row", gap: 0 }}>
        {(props.actions ?? []).map((action) => (
          <IconButton
            key={`${props.label}:${action.icon}`}
            icon={action.icon}
            width={3}
            {...(action.active !== undefined ? { active: action.active } : {})}
            onPress={action.onPress}
          />
        ))}
      </box>
    </box>
  );
}

function IconButton(props: {
  icon: string;
  active?: boolean;
  accent?: boolean;
  iconColor?: string;
  width?: number;
  justifyContent?: "center" | "flex-start" | "flex-end";
  onPress: (event?: SidebarMouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const background = props.accent
    ? hovered
      ? PALETTE.accent
      : PALETTE.composerBorder
    : props.active
      ? PALETTE.controlActive
      : hovered
        ? PALETTE.controlHover
        : PALETTE.control;
  const foreground = props.accent ? PALETTE.text : props.active ? PALETTE.text : PALETTE.muted;

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onPress(event);
      }}
      style={{
        width: props.width ?? 3,
        minWidth: props.width ?? 3,
        maxWidth: props.width ?? 3,
        height: 1,
        backgroundColor: background,
        justifyContent: props.justifyContent ?? "center",
        alignItems: "center",
        flexGrow: 0,
        flexShrink: 0,
      }}
    >
      <text content={props.icon} style={{ fg: props.iconColor ?? foreground }} />
    </box>
  );
}

function ToolbarButton(props: {
  icon?: string;
  label?: string | undefined;
  active?: boolean;
  disabled?: boolean;
  iconColor?: string;
  marginRight?: number;
  compact?: boolean;
  surface?: "default" | "inset";
  chrome?: "default" | "bare";
  width?: number;
  justifyContent?: "center" | "flex-start" | "flex-end";
  onPress: (event?: SidebarMouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const foreground = props.disabled ? PALETTE.subtle : props.active ? PALETTE.text : PALETTE.muted;
  const isBare = props.chrome === "bare";
  const restingBackground = props.surface === "inset" ? PALETTE.controlInset : PALETTE.control;
  const disabledBackground = props.surface === "inset" ? PALETTE.controlInset : PALETTE.control;
  const background = isBare
    ? "transparent"
    : props.active
      ? PALETTE.controlActive
      : props.disabled
        ? disabledBackground
        : hovered
          ? props.surface === "inset"
            ? PALETTE.controlInsetHover
            : PALETTE.controlHover
          : restingBackground;

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        props.onPress(event);
      }}
      style={{
        backgroundColor: background,
        paddingLeft: isBare ? 1 : 1,
        paddingRight: isBare ? 1 : 1,
        marginRight: isBare ? 0 : (props.marginRight ?? 1),
        minHeight: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: props.justifyContent ?? "center",
        flexShrink: 0,
        ...(isBare
          ? props.label
            ? {}
            : { width: props.width ?? 3 }
          : props.label
            ? {}
            : props.compact
              ? { width: props.width ?? 3, paddingLeft: 0, paddingRight: 0 }
              : { width: props.width ?? 4 }),
      }}
    >
      {props.icon ? (
        <text
          content={props.icon}
          style={{
            fg: props.iconColor ?? foreground,
            marginRight: props.label ? 1 : 0,
          }}
        />
      ) : null}
      {props.label ? <text content={props.label} style={{ fg: foreground }} /> : null}
    </box>
  );
}

function TogglePill(props: { checked: boolean; onPress: () => void; disabled?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const background = props.disabled
    ? PALETTE.controlActive
    : props.checked
      ? hovered
        ? PALETTE.composerSendHover
        : PALETTE.composerSend
      : hovered
        ? PALETTE.controlHover
        : PALETTE.controlActive;
  const knobColor = props.disabled ? PALETTE.subtle : "#f5f5f5";
  const edgeColor = background;

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        props.onPress();
      }}
      style={{
        width: 4,
        height: 1,
        backgroundColor: background,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <text content="▐" style={{ fg: edgeColor }} />
      <text content={props.checked ? " " : "■"} style={{ fg: knobColor }} />
      <text content={props.checked ? "■" : " "} style={{ fg: knobColor }} />
      <text content="▌" style={{ fg: edgeColor }} />
    </box>
  );
}

function FooterDivider() {
  return (
    <text
      content="│"
      style={{
        fg: PALETTE.border,
        marginLeft: 0,
        marginRight: 1,
        flexShrink: 0,
      }}
    />
  );
}

function SidebarRow(props: {
  active?: boolean;
  selected?: boolean;
  compact?: boolean;
  suppressHighlight?: boolean;
  activeBackgroundColor?: string;
  onPress?: (event: SidebarMouseEvent) => void;
  onSecondaryPress?: (event: SidebarMouseEvent) => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const activeBackgroundColor = props.activeBackgroundColor ?? PALETTE.controlActive;
  const background = props.suppressHighlight
    ? "transparent"
    : props.active && props.selected
      ? PALETTE.selectionActive
      : props.selected
        ? PALETTE.selection
        : props.active
          ? activeBackgroundColor
          : hovered
            ? PALETTE.controlHover
            : "transparent";

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      {...(props.onPress
        ? {
            onMouseDown: (event: SidebarMouseEvent) => {
              event.preventDefault();
              event.stopPropagation?.();
              if (event.button === 2) {
                props.onSecondaryPress?.(event);
                return;
              }
              props.onPress?.(event);
            },
          }
        : {})}
      style={{
        backgroundColor: background,
        paddingLeft: 1,
        paddingRight: 1,
        height: props.compact ? 1 : 2,
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {props.children}
    </box>
  );
}

function PopupRow(props: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  iconColor?: string;
  trailingLabel?: string;
  onHover?: () => void;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = !props.disabled && (props.active || hovered);
  const iconColor = props.disabled
    ? PALETTE.subtle
    : (props.iconColor ?? (active ? PALETTE.text : PALETTE.muted));
  const labelColor = props.disabled ? PALETTE.subtle : active ? PALETTE.text : PALETTE.muted;

  return (
    <box
      onMouseOver={() => {
        setHovered(true);
        if (!props.disabled) {
          props.onHover?.();
        }
      }}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        props.onPress();
      }}
      style={{
        backgroundColor: active ? PALETTE.controlActive : PALETTE.popup,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        height: 1,
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 0,
      }}
    >
      <text content={props.icon} style={{ fg: iconColor, marginRight: 1 }} />
      <box style={{ flexGrow: 1, flexShrink: 1, overflow: "hidden", height: 1 }}>
        <text content={props.label} style={{ fg: labelColor }} />
      </box>
      {props.trailingLabel ? (
        <>
          <text content={props.trailingLabel} style={{ fg: PALETTE.subtle }} />
        </>
      ) : null}
    </box>
  );
}

function PendingInputOptionRow(props: {
  label: string;
  description?: string;
  shortcutLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = !props.disabled && (props.selected || hovered);

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        event.stopPropagation?.();
        props.onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: active ? PALETTE.controlActive : PALETTE.surface,
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
        minHeight: 1,
      }}
    >
      {props.shortcutLabel ? (
        <text
          content={props.shortcutLabel}
          style={{
            fg: active ? PALETTE.accent : PALETTE.subtle,
            marginRight: 1,
          }}
        />
      ) : null}
      <box style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1 }}>
        <text
          content={props.label}
          style={{ fg: props.disabled ? PALETTE.subtle : PALETTE.text }}
        />
        {props.description ? (
          <text content={props.description} style={{ fg: PALETTE.subtle }} />
        ) : null}
      </box>
      {props.selected ? <text content="󰄬" style={{ fg: PALETTE.accent }} /> : null}
    </box>
  );
}

function SettingsSection(props: { title: string; children: React.ReactNode }) {
  return (
    <box style={{ flexDirection: "column", marginBottom: 2 }}>
      <text content={props.title} style={{ fg: PALETTE.subtle, marginBottom: 1 }} />
      <box style={{ flexDirection: "column" }}>{props.children}</box>
    </box>
  );
}

function SettingsRow(props: {
  title: string;
  description: string;
  status?: React.ReactNode;
  resetAction?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <box
      style={{
        flexDirection: "column",
        border: ["top"],
        borderColor: PALETTE.border,
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <box style={{ flexDirection: "column", flexGrow: 1, flexShrink: 1 }}>
          <box style={{ flexDirection: "row", alignItems: "center" }}>
            <text content={props.title} style={{ fg: PALETTE.text, marginRight: 1 }} />
            {props.resetAction ? props.resetAction : null}
          </box>
          <text content={props.description} style={{ fg: PALETTE.muted }} />
          {props.status ? (
            typeof props.status === "string" ? (
              <text content={props.status} style={{ fg: PALETTE.subtle }} />
            ) : (
              <box style={{ flexDirection: "column" }}>{props.status}</box>
            )
          ) : null}
        </box>
        {props.control ? (
          <box
            style={{
              marginLeft: 1,
              flexShrink: 0,
              alignSelf: "flex-start",
            }}
          >
            {props.control}
          </box>
        ) : null}
      </box>
      {props.children ? (
        <box style={{ flexDirection: "column", marginTop: 1 }}>{props.children}</box>
      ) : null}
    </box>
  );
}

function SelectionCopyToast(props: { message: string }) {
  return (
    <box
      style={{
        position: "absolute",
        top: 1,
        right: 2,
        zIndex: 60,
        backgroundColor: PALETTE.popup,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <text content="󰆏" style={{ fg: PALETTE.text, marginRight: 1 }} />
      <text content={props.message} style={{ fg: PALETTE.text }} />
    </box>
  );
}

function SettingResetButton(props: { onPress: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onPress();
      }}
      style={{
        width: 3,
        height: 1,
        backgroundColor: hovered ? PALETTE.controlHover : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <text content="↺" style={{ fg: PALETTE.muted }} />
    </box>
  );
}

function ComposerSendButton(props: {
  icon: string;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "send" | "stop";
}) {
  const [hovered, setHovered] = useState(false);
  const isStop = props.variant === "stop";
  const background = props.disabled
    ? PALETTE.controlActive
    : isStop
      ? hovered
        ? PALETTE.composerStopHover
        : PALETTE.composerStop
      : hovered
        ? PALETTE.composerSendHover
        : PALETTE.composerSend;
  const foreground = props.disabled ? PALETTE.subtle : "#f5f5f5";

  return (
    <box
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!props.disabled) props.onPress();
      }}
      style={{
        paddingLeft: props.label ? 1 : 0,
        paddingRight: props.label ? 1 : 0,
        width: props.label ? "auto" : 3,
        height: 1,
        backgroundColor: background,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {props.label ? (
        <text content={props.label} style={{ fg: foreground, marginRight: 1 }} />
      ) : null}
      <text content={props.icon} style={{ fg: foreground }} />
    </box>
  );
}

export function App({
  renderer: _renderer,
  interruptRequestToken = 0,
  onRequestExit,
}: {
  renderer: {
    destroy: () => void;
    setBackgroundColor?: (color: string) => void;
    setCursorColor?: (color: RGBA) => void;
    setCursorStyle?: (options: {
      style: "block" | "line" | "underline";
      blinking?: boolean;
    }) => void;
  };
  interruptRequestToken?: number;
  onRequestExit?: () => void;
}) {
  const terminalRenderer = _renderer as {
    capabilities?: {
      kitty_graphics?: boolean;
      sixel?: boolean;
    } | null;
    resolution?: { width: number; height: number } | null;
    writeOut?: (chunk: string) => void;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
    console?: TerminalConsole;
    getSelection?: () => { getSelectedText: () => string } | null;
    clearSelection?: () => void;
  };
  const paths = useMemo(() => resolveTuiPaths(), []);
  const logger = useMemo(() => createT1Logger(paths.logPath), [paths.logPath]);
  const [api, setApi] = useState<T1Api | null>(null);
  const [snapshot, setSnapshot] = useState<OrchestrationReadModel | null>(null);
  const [serverConfig, setServerConfig] = useState<TuiServerConfig>(null);
  const [, setStatus] = useState("Booting");
  const [selectionCopyToast, setSelectionCopyToast] = useState<string | null>(null);
  const [startupIssue, setStartupIssue] = useState<string | null>(null);
  const [mainView, setMainView] = useState<MainView>("thread");
  const [composer, setComposer] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<DraftComposerImageAttachment[]>(
    [],
  );
  const [composerAttachmentDeleteArmed, setComposerAttachmentDeleteArmed] = useState(false);
  const [composerResetKey, setComposerResetKey] = useState(0);
  const [, setComposerSelectionPaintTick] = useState(0);
  const composerRef = useRef<TextareaRenderable | null>(null);
  const composerValueRef = useRef("");
  const deferredComposerSyncRef = useRef(createDeferredComposerSyncState());
  const timelineScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const composerBranchScrollRef = useRef<ScrollBoxRenderable | null>(null);
  const gitRefreshInFlightRef = useRef(false);
  const gitRefreshQueuedRef = useRef(false);
  const [imagePasteInFlight, setImagePasteInFlight] = useState(false);
  const sendInFlightRef = useRef(false);
  const interruptInFlightRef = useRef(false);
  const [pendingSends, setPendingSends] = useState<PendingSendPreview[]>([]);
  const [lastSubmittedByThreadId, setLastSubmittedByThreadId] = useState<
    Readonly<Record<string, InterruptedTurnRecovery>>
  >({});
  const lastSubmittedByThreadIdRef = useRef<Readonly<Record<string, InterruptedTurnRecovery>>>({});
  const [suppressedInterruptedTurnsByThreadId, setSuppressedInterruptedTurnsByThreadId] = useState<
    Readonly<Record<string, readonly SuppressedInterruptedTurnState[]>>
  >({});
  const [sendAnimationTick, setSendAnimationTick] = useState(0);
  const [sidebarPulseTick, setSidebarPulseTick] = useState(0);
  const [projectPathDraft, setProjectPathDraft] = useState("");
  const [projectPathResetKey, setProjectPathResetKey] = useState(0);
  const projectPathRef = useRef<InputRenderable | null>(null);
  const [projectPathSuggestions, setProjectPathSuggestions] = useState<string[]>([]);
  const [projectPathError, setProjectPathError] = useState<string | null>(null);
  const [projectPathBusy, setProjectPathBusy] = useState(false);
  const [composerMentions, setComposerMentions] = useState<ComposerMention[]>([]);
  const [pathSuggestionEntries, setPathSuggestionEntries] = useState<ProjectEntry[]>([]);
  const [pathSuggestionIndex, setPathSuggestionIndex] = useState(0);
  const [pathSuggestionsLoading, setPathSuggestionsLoading] = useState(false);
  const [projectPathPromptOpen, setProjectPathPromptOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const selectedProjectIdRef = useRef<string | undefined>(undefined);
  const selectedThreadIdRef = useRef<string | undefined>(undefined);
  const handledWelcomeBootstrapRef = useRef(false);
  const [pendingCreatedThreadId, setPendingCreatedThreadId] = useState<string | null>(null);
  const [draftThreadsByProjectId, setDraftThreadsByProjectId] = useState<
    Readonly<Record<string, DraftThreadState>>
  >({});
  const draftThreadsByProjectIdRef = useRef<Readonly<Record<string, DraftThreadState>>>({});
  const [composerDraftsByThreadId, setComposerDraftsByThreadId] = useState<
    Readonly<Record<string, ComposerDraftState>>
  >({});
  const [draftProvider, setDraftProvider] = useState<ProviderKind>("codex");
  const [draftModel, setDraftModel] = useState(DEFAULT_MODEL_BY_PROVIDER.codex);
  const [draftModelOptions, setDraftModelOptions] = useState<ProviderModelOptions | undefined>();
  const [draftRuntimeMode, setDraftRuntimeMode] = useState<RuntimeMode>("full-access");
  const [draftInteractionMode, setDraftInteractionMode] = useState<"default" | "plan">("default");
  const [focusArea, setFocusArea] = useState<FocusArea>("composer");
  const [diffOpen, setDiffOpen] = useState(false);
  const [sidebarCollapsedPreference, setSidebarCollapsedPreference] = useState(false);
  const [sidebarOverlayOpen, setSidebarOverlayOpen] = useState(false);
  const [diffView, setDiffView] = useState<"unified" | "split">("unified");
  const [diffText, setDiffText] = useState("");
  const [collapsedDiffFileKeys, setCollapsedDiffFileKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [overlayMenu, setOverlayMenu] = useState<OverlayMenu>(null);
  const [overlayAnchor, setOverlayAnchor] = useState<{
    x: number | null;
    y: number | null;
  } | null>(null);
  const [sidebarContextMenu, setSidebarContextMenu] = useState<SidebarContextMenuState | null>(
    null,
  );
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [renameThreadDialog, setRenameThreadDialog] = useState<RenameThreadDialogState | null>(
    null,
  );
  const [modelMenuProvider, setModelMenuProvider] = useState<ProviderKind>("codex");
  const [modelSubmenuOpen, setModelSubmenuOpen] = useState(false);
  const [modelMenuIndex, setModelMenuIndex] = useState(0);
  const [gitMenuIndex, setGitMenuIndex] = useState(0);
  const [composerEnvMenuIndex, setComposerEnvMenuIndex] = useState(0);
  const [composerBranchMenuIndex, setComposerBranchMenuIndex] = useState(0);
  const [settingsSelectKind, setSettingsSelectKind] = useState<SettingsSelectKind>("git-model");
  const [settingsSelectIndex, setSettingsSelectIndex] = useState(0);
  const [sidebarSortIndex, setSidebarSortIndex] = useState(0);
  const [traitsMenuIndex, setTraitsMenuIndex] = useState(0);
  const [expandedProjectIds, setExpandedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [locallyUnreadThreadIds, setLocallyUnreadThreadIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [locallyVisitedThreads, setLocallyVisitedThreads] = useState<LocalThreadVisitedState>({});
  const [selectedThreadIds, setSelectedThreadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectionAnchorThreadId, setSelectionAnchorThreadId] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [respondingRequestIds, setRespondingRequestIds] = useState<readonly ApprovalRequestId[]>(
    [],
  );
  const [respondingUserInputRequestIds, setRespondingUserInputRequestIds] = useState<
    readonly ApprovalRequestId[]
  >([]);
  const [pendingUserInputAnswersByRequestId, setPendingUserInputAnswersByRequestId] = useState<
    Readonly<Record<string, PendingUserInputAnswerMap>>
  >({});
  const [pendingUserInputQuestionIndexByRequestId, setPendingUserInputQuestionIndexByRequestId] =
    useState<Readonly<Record<string, number>>>({});
  const [selectedCustomModelProvider, setSelectedCustomModelProvider] =
    useState<ProviderKind>("codex");
  const [customModelInputByProvider, setCustomModelInputByProvider] = useState<
    Record<ProviderKind, string>
  >({
    codex: "",
    claudeAgent: "",
  });
  const [customModelErrorByProvider, setCustomModelErrorByProvider] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});
  const [showAllCustomModels, setShowAllCustomModels] = useState(false);
  const [openInstallProviders, setOpenInstallProviders] = useState<Record<ProviderKind, boolean>>({
    codex: false,
    claudeAgent: false,
  });
  const [isOpeningKeybindings, setIsOpeningKeybindings] = useState(false);
  const [openKeybindingsError, setOpenKeybindingsError] = useState<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [serverHttpOrigin, setServerHttpOrigin] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [gitBranchList, setGitBranchList] = useState<GitListBranchesResult | null>(null);
  const [gitStateError, setGitStateError] = useState<string | null>(null);
  const [gitActionBusy, setGitActionBusy] = useState(false);
  const [gitActionStatus, setGitActionStatus] = useState<string | null>(null);
  const activeGitActionIdRef = useRef<string | null>(null);
  const [terminalImageSupport, setTerminalImageSupport] = useState<TerminalImageSupport>(() =>
    resolveTerminalImageSupport(terminalRenderer),
  );
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const previewAttachmentCacheRef = useRef<Map<string, string>>(new Map());
  const composerDraftsByThreadIdRef = useRef<Readonly<Record<string, ComposerDraftState>>>({});
  const updateAppSettings = useCallback((patch: Partial<AppSettings>) => {
    setAppSettings((current) => normalizeAppSettings({ ...current, ...patch }));
  }, []);
  const resolvedTheme =
    appSettings.theme === "light" ? "light" : appSettings.theme === "dark" ? "dark" : "dark";
  const palette = resolvedTheme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  Object.assign(PALETTE, palette);
  MESSAGE_MARKDOWN_SYNTAX = buildMessageMarkdownSyntax(PALETTE);
  DIFF_SYNTAX = buildDiffSyntax(PALETTE);
  CODE_BLOCK_SYNTAX = buildCodeBlockSyntax(PALETTE);

  useEffect(() => {
    draftThreadsByProjectIdRef.current = draftThreadsByProjectId;
  }, [draftThreadsByProjectId]);

  useEffect(() => {
    lastSubmittedByThreadIdRef.current = lastSubmittedByThreadId;
  }, [lastSubmittedByThreadId]);

  useEffect(() => {
    composerDraftsByThreadIdRef.current = composerDraftsByThreadId;
  }, [composerDraftsByThreadId]);

  useEffect(() => {
    _renderer.setBackgroundColor?.(PALETTE.canvas);
    _renderer.setCursorColor?.(RGBA.fromHex(PALETTE.cursor));
    _renderer.setCursorStyle?.({
      style: "block",
      blinking: false,
    });
  }, [_renderer, resolvedTheme]);

  useEffect(() => {
    setTerminalImageSupport(resolveTerminalImageSupport(terminalRenderer));
    const handler = () => {
      setTerminalImageSupport(resolveTerminalImageSupport(terminalRenderer));
    };
    terminalRenderer.on?.("capabilities", handler);
    terminalRenderer.on?.("resize", handler);
    return () => {
      terminalRenderer.off?.("capabilities", handler);
      terminalRenderer.off?.("resize", handler);
    };
  }, [terminalRenderer]);

  const copyToClipboard = useCallback(
    async (value: string, successStatus: string) => {
      try {
        await copyTextToClipboard(value);
        setStatus(successStatus);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Clipboard copy failed");
      }
    },
    [setStatus],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        logger.log("app.boot", {
          cwd: process.cwd(),
          homeDir: paths.homeDir,
          configHomeDir: paths.configHomeDir,
          logPath: paths.logPath,
        });
        const prefs = await readPrefs(paths);
        logger.log("prefs.loaded", prefs as Record<string, unknown>);
        if (disposed) return;
        setStartupIssue(null);
        if (prefs.selectedProjectId) {
          selectedProjectIdRef.current = prefs.selectedProjectId;
          setSelectedProjectId(prefs.selectedProjectId);
        }
        if (prefs.selectedThreadId) {
          selectedThreadIdRef.current = prefs.selectedThreadId;
          setSelectedThreadId(prefs.selectedThreadId);
        }
        if (prefs.expandedProjectIds?.length) {
          setExpandedProjectIds(new Set(prefs.expandedProjectIds));
        }
        if (prefs.locallyUnreadThreadIds?.length) {
          setLocallyUnreadThreadIds(new Set(prefs.locallyUnreadThreadIds));
        }
        if (prefs.threadLastVisitedAtById) {
          setLocallyVisitedThreads(prefs.threadLastVisitedAtById);
        }
        if (prefs.composerDraftsByThreadId) {
          setComposerDraftsByThreadId(
            Object.fromEntries(
              Object.entries(prefs.composerDraftsByThreadId).map(([threadId, draft]) => [
                threadId,
                {
                  text: draft.text,
                  mentions: (draft.mentions ?? []).map(cloneComposerMention),
                  attachments: draft.attachments.map((attachment) => ({
                    ...attachment,
                  })),
                },
              ]),
            ),
          );
        }
        if (prefs.mainView === "settings" || prefs.mainView === "keybindings") {
          setMainView(prefs.mainView);
          setFocusArea("settings");
        }
        if (prefs.appSettings) {
          setAppSettings(
            normalizeAppSettings({
              ...DEFAULT_APP_SETTINGS,
              ...prefs.appSettings,
            }),
          );
          setOpenInstallProviders({
            codex: Boolean(prefs.appSettings.codexBinaryPath || prefs.appSettings.codexHomePath),
            claudeAgent: Boolean(prefs.appSettings.claudeBinaryPath),
          });
        }
        const persistedProvider = normalizePersistedProvider(prefs.draftProvider);
        const nextProvider = persistedProvider ?? "codex";
        setDraftProvider(nextProvider);
        setDraftModel(resolvePersistedModel(nextProvider, prefs.draftModel));
        setDraftModelOptions(prefs.draftModelOptions);
        setDraftRuntimeMode(normalizePersistedRuntimeMode(prefs.draftRuntimeMode) ?? "full-access");
        setDraftInteractionMode(
          normalizePersistedInteractionMode(prefs.draftInteractionMode) ?? "default",
        );
        setDiffOpen(Boolean(prefs.diffOpen));
        setDiffView(prefs.diffView ?? "unified");
        setPrefsReady(true);

        const attachedServer = resolveAttachedServerConnection();
        const server = attachedServer
          ? {
              wsUrl: attachedServer.wsUrl,
              stop: () => undefined,
            }
          : await startServerSupervisor({
              homeDir: paths.homeDir,
              logPath: paths.logPath,
              onExit: ({ code, signal }) => {
                if (disposed) return;
                logger.log("server.onExit", { code, signal: signal ?? null });
                setStatus("Reconnecting");
              },
              onRestart: ({ attempt }) => {
                if (disposed) return;
                logger.log("server.onRestart", { attempt });
                setStatus("Restarting");
              },
              onLog: (event, details) => logger.log(event, details),
            });
        if (attachedServer) {
          logger.log("server.attached", {
            host: attachedServer.host,
            port: attachedServer.port,
          });
        }
        const transport = new WsTransport({
          url: server.wsUrl,
          onWarning: (message, details) => logger.log("ws.warning", { message, details }),
        });
        setServerHttpOrigin(resolveHttpOriginFromWsUrl(server.wsUrl));
        const nativeBridge = createTransportNativeApi({ transport });
        const nativeApi = nativeBridge.api;
        logger.log("ws.connecting", { wsUrl: server.wsUrl });
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        let refreshAttempts = 0;

        const scheduleRefreshRetry = (reason: string) => {
          if (disposed || refreshTimer !== null) return;
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
            void refresh(`retry:${reason}`);
          }, 1_000);
          logger.log("snapshot.retryScheduled", { reason });
        };

        const refresh = createCoalescedRefreshRunner(async (reason: string) => {
          if (disposed) return;
          try {
            logger.log("snapshot.refreshStarted", { reason });
            const nextSnapshot = await transport.request<OrchestrationReadModel>(
              ORCHESTRATION_WS_METHODS.getSnapshot,
              undefined,
              { timeoutMs: 5_000 },
            );
            if (disposed) return;
            refreshAttempts = 0;
            setSnapshot(nextSnapshot);
            logger.log("snapshot.refreshed", {
              reason,
              projectCount: nextSnapshot.projects.length,
              threadCount: nextSnapshot.threads.length,
            });
            setStatus("Ready");
          } catch (error) {
            if (disposed) return;
            refreshAttempts += 1;
            logger.log("snapshot.refreshFailed", {
              reason,
              attempt: refreshAttempts,
              error: error instanceof Error ? error.message : String(error),
            });
            setStatus(refreshAttempts > 2 ? "Disconnected" : "Booting");
            scheduleRefreshRetry(reason);
          }
        });

        setApi(nativeApi);
        void nativeApi.server
          .getConfig()
          .then((config) => {
            if (!disposed) {
              setServerConfig(config);
            }
          })
          .catch((error) => {
            logger.log("serverConfig.loadFailed", {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        await refresh("initial");
        const unsubscribeWelcome = nativeBridge.events.onServerWelcome((payload) => {
          logger.log("server.welcome", payload as Record<string, unknown>);
          if (
            payload.bootstrapProjectId &&
            shouldApplyWelcomeBootstrapSelection({
              hasHandledWelcomeBootstrap: handledWelcomeBootstrapRef.current,
              currentSelectionId: selectedProjectIdRef.current,
            })
          ) {
            selectedProjectIdRef.current = payload.bootstrapProjectId;
            setSelectedProjectId(payload.bootstrapProjectId);
          }
          if (
            payload.bootstrapThreadId &&
            shouldApplyWelcomeBootstrapSelection({
              hasHandledWelcomeBootstrap: handledWelcomeBootstrapRef.current,
              currentSelectionId: selectedThreadIdRef.current,
            })
          ) {
            selectedThreadIdRef.current = payload.bootstrapThreadId;
            setSelectedThreadId(payload.bootstrapThreadId);
          }
          handledWelcomeBootstrapRef.current = true;
          void refresh("welcome");
        });
        const unsubscribe = nativeApi.orchestration.onDomainEvent(() => {
          logger.log("orchestration.domainEvent");
          void refresh("domain-event");
        });
        const unsubscribeServerConfig = nativeBridge.events.onServerConfigUpdated((payload) => {
          setServerConfig((current) =>
            current
              ? {
                  ...current,
                  issues: payload.issues,
                  providers: payload.providers,
                }
              : current,
          );
        });

        cleanup = () => {
          logger.log("app.cleanup");
          if (refreshTimer !== null) {
            clearTimeout(refreshTimer);
          }
          unsubscribeWelcome();
          unsubscribe();
          unsubscribeServerConfig();
          transport.dispose();
          server.stop();
        };
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        logger.log("app.bootFailed", { error: message });
        setStartupIssue(message);
        setStatus("Startup failed");
      }
    })();

    return () => {
      disposed = true;
      clearTerminalImagePreview(terminalRenderer);
      cleanup?.();
    };
  }, [logger, paths, terminalRenderer]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    if (!prefsReady) return;
    const prefs = {
      mainView,
      draftProvider,
      draftModel,
      draftRuntimeMode,
      draftInteractionMode,
      diffOpen,
      diffView,
      ...(draftModelOptions ? { draftModelOptions } : {}),
      ...(selectedProjectId ? { selectedProjectId } : {}),
      ...(selectedThreadId && !isDraftThreadId(selectedThreadId) ? { selectedThreadId } : {}),
      ...(expandedProjectIds.size > 0 ? { expandedProjectIds: [...expandedProjectIds] } : {}),
      ...(locallyUnreadThreadIds.size > 0
        ? { locallyUnreadThreadIds: [...locallyUnreadThreadIds] }
        : {}),
      ...(Object.keys(locallyVisitedThreads).length > 0
        ? { threadLastVisitedAtById: locallyVisitedThreads }
        : {}),
      ...(Object.keys(composerDraftsByThreadId).length > 0 ? { composerDraftsByThreadId } : {}),
      appSettings,
    } satisfies TuiPrefs;
    void writePrefs(paths, prefs);
    logger.log("prefs.saved", prefs as Record<string, unknown>);
  }, [
    diffOpen,
    diffView,
    draftInteractionMode,
    draftModel,
    draftModelOptions,
    draftProvider,
    draftRuntimeMode,
    locallyUnreadThreadIds,
    locallyVisitedThreads,
    logger,
    mainView,
    prefsReady,
    paths,
    appSettings,
    composerDraftsByThreadId,
    expandedProjectIds,
    selectedProjectId,
    selectedThreadId,
  ]);

  const projects = useMemo(
    () => snapshot?.projects.filter((project) => project.deletedAt === null) ?? [],
    [snapshot?.projects],
  );
  const allThreads = useMemo(
    () => snapshot?.threads.filter((thread) => thread.deletedAt === null) ?? [],
    [snapshot?.threads],
  );
  const sortedProjects = useMemo(
    () =>
      sortProjectsForSidebar(
        projects,
        allThreads,
        appSettings.sidebarProjectSortOrder ?? DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
      ),
    [allThreads, appSettings.sidebarProjectSortOrder, projects],
  );
  const activeProjectId = selectedProjectId ?? sortedProjects[0]?.id;
  const activeProject = sortedProjects.find((project) => project.id === activeProjectId) ?? null;
  const hasPulsingThreadStatus = useMemo(
    () => allThreads.some((thread) => isThreadActivelyWorking(thread)),
    [allThreads],
  );
  const threadsByProject = useMemo(() => {
    const map = new Map<string, ThreadReadModel[]>();
    for (const project of projects) {
      map.set(project.id, []);
    }
    for (const thread of allThreads) {
      const bucket = map.get(thread.projectId);
      if (bucket) {
        bucket.push(thread);
      } else {
        map.set(thread.projectId, [thread]);
      }
    }
    for (const bucket of map.values()) {
      const sortedBucket = sortThreadsForSidebar(
        bucket,
        appSettings.sidebarThreadSortOrder ?? DEFAULT_SIDEBAR_THREAD_SORT_ORDER,
      );
      bucket.splice(0, bucket.length, ...sortedBucket);
    }
    return map;
  }, [allThreads, appSettings.sidebarThreadSortOrder, projects]);
  const threads = useMemo(
    () => (activeProjectId ? (threadsByProject.get(activeProjectId) ?? []) : []),
    [activeProjectId, threadsByProject],
  );
  const activeDraftThread = useMemo(() => {
    if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) {
      return null;
    }
    const selectedDraftThread = Object.values(draftThreadsByProjectId).find(
      (draftThread) => draftThread.id === selectedThreadId,
    );
    if (!selectedDraftThread) {
      return null;
    }
    if (activeProjectId && activeProjectId !== selectedDraftThread.projectId) {
      return null;
    }
    if (threads.some((thread) => thread.id === selectedDraftThread.id)) {
      return null;
    }
    return selectedDraftThread;
  }, [activeProjectId, draftThreadsByProjectId, selectedThreadId, threads]);
  const activeThreadId = activeDraftThread?.id ?? selectedThreadId ?? threads[0]?.id;
  const activeThread = activeDraftThread
    ? null
    : (threads.find((thread) => thread.id === activeThreadId) ?? null);
  const activeThreadIsRunning = isThreadActivelyWorking(activeThread);
  const activeThreadBranch = activeThread?.branch ?? activeDraftThread?.branch ?? null;
  const activeWorktreePath = activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null;
  const activeThreadGitSyncKey = resolveThreadGitSyncKey(activeThread);
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const hasServerThread = activeThread !== null;
  const effectiveThreadEnvMode = resolveEffectiveThreadEnvMode({
    activeWorktreePath,
    hasServerThread,
    draftThreadEnvMode: activeDraftThread?.envMode,
    fallbackEnvMode: appSettings.defaultThreadEnvMode,
  });
  const envLocked = Boolean(
    activeThread &&
    (activeThread.messages.length > 0 ||
      (activeThread.session !== null && activeThread.session.status !== "stopped")),
  );
  const gitCwd = activeWorktreePath ?? activeProjectCwd ?? null;
  const composerSearchCwd = activeWorktreePath ?? activeProjectCwd ?? null;
  const suppressedInterruptedTurns = activeThreadId
    ? (suppressedInterruptedTurnsByThreadId[activeThreadId] ?? EMPTY_SUPPRESSED_INTERRUPTED_TURNS)
    : EMPTY_SUPPRESSED_INTERRUPTED_TURNS;
  const visibleThreadMessages = useMemo(
    () =>
      activeThread
        ? activeThread.messages.filter((message) => {
            if (suppressedInterruptedTurns.length === 0) {
              return true;
            }
            return !suppressedInterruptedTurns.some(
              (suppressed) =>
                message.id === suppressed.messageId || message.turnId === suppressed.turnId,
            );
          })
        : [],
    [activeThread, suppressedInterruptedTurns],
  );
  const visibleThreadProposedPlans = useMemo(
    () =>
      activeThread
        ? activeThread.proposedPlans.filter(
            (plan) =>
              suppressedInterruptedTurns.length === 0 ||
              !suppressedInterruptedTurns.some((suppressed) => plan.turnId === suppressed.turnId),
          )
        : [],
    [activeThread, suppressedInterruptedTurns],
  );
  const visibleThreadActivities = useMemo(
    () =>
      activeThread
        ? activeThread.activities.filter(
            (activity) =>
              suppressedInterruptedTurns.length === 0 ||
              !suppressedInterruptedTurns.some(
                (suppressed) => activity.turnId === suppressed.turnId,
              ),
          )
        : [],
    [activeThread, suppressedInterruptedTurns],
  );
  const workEntries = activeThread
    ? deriveWorkLogEntries(visibleThreadActivities, activeThread.latestTurn?.turnId ?? undefined)
    : [];
  const approvals = useMemo(
    () => (activeThread ? derivePendingApprovals(visibleThreadActivities) : []),
    [activeThread, visibleThreadActivities],
  );
  const userInputs = useMemo(
    () => (activeThread ? derivePendingUserInputs(visibleThreadActivities) : []),
    [activeThread, visibleThreadActivities],
  );
  const activePendingApproval = approvals[0] ?? null;
  const activePendingUserInput = userInputs[0] ?? null;
  const activePendingUserInputAnswers = useMemo(
    () =>
      (activePendingUserInput
        ? pendingUserInputAnswersByRequestId[activePendingUserInput.requestId]
        : undefined) ?? EMPTY_PENDING_USER_INPUT_ANSWERS,
    [activePendingUserInput, pendingUserInputAnswersByRequestId],
  );
  const activePendingQuestionIndex = activePendingUserInput
    ? (pendingUserInputQuestionIndexByRequestId[activePendingUserInput.requestId] ?? 0)
    : 0;
  const activePendingProgress = activePendingUserInput
    ? derivePendingUserInputProgress(
        activePendingUserInput.questions,
        activePendingUserInputAnswers,
        activePendingQuestionIndex,
      )
    : null;
  const activePendingResolvedAnswers = activePendingUserInput
    ? buildPendingUserInputAnswers(activePendingUserInput.questions, activePendingUserInputAnswers)
    : null;
  const activePendingIsResponding = activePendingUserInput
    ? respondingUserInputRequestIds.includes(activePendingUserInput.requestId)
    : false;

  const timelineEntries = activeThread
    ? deriveTimelineEntries(
        visibleThreadMessages as unknown as Parameters<typeof deriveTimelineEntries>[0],
        visibleThreadProposedPlans as unknown as Parameters<typeof deriveTimelineEntries>[1],
        workEntries,
      )
    : [];
  const activePendingSends = activeThreadId
    ? pendingSends
        .filter((entry) => {
          if (entry.threadId !== activeThreadId) {
            return false;
          }
          const thread = allThreads.find((candidate) => candidate.id === entry.threadId);
          if (!thread) {
            return true;
          }
          return !thread.messages.some((message) => message.id === entry.messageId);
        })
        .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];
  const showAssistantTyping = activeThreadIsRunning || activePendingSends.length > 0;
  const latestProposedPlan = activeThread
    ? findLatestProposedPlan(activeThread.proposedPlans, activeThread.latestTurn?.turnId ?? null)
    : null;
  const latestTurnSettled = Boolean(
    activeThread?.latestTurn?.startedAt &&
    activeThread.latestTurn.completedAt &&
    !activeThreadIsRunning,
  );
  const showPlanFollowUpPrompt =
    userInputs.length === 0 &&
    draftInteractionMode === "plan" &&
    latestTurnSettled &&
    hasActionableProposedPlan(latestProposedPlan);
  const totalColumns =
    process.stdout.columns ?? (Number(process.env.T1CODE_HEADLESS_WIDTH ?? 0) || 160);
  const responsiveLayout = resolveTuiResponsiveLayout({
    viewportColumns: totalColumns,
    sidebarCollapsedPreference,
  });
  const showSidebarOverlay = !responsiveLayout.showSidebar && sidebarOverlayOpen;
  const showFullDiffView = mainView === "thread" && diffOpen;
  const mainPanelColumns =
    totalColumns - responsiveLayout.sidebarWidth - (responsiveLayout.showSidebar ? 1 : 0);
  const diffFiles = useMemo(() => parseDiffFiles(diffText), [diffText]);
  const userMessageBubbleWidth = resolveUserMessageBubbleWidth(mainPanelColumns);
  const customModelsByProvider = useMemo(
    () => ({
      codex: getCustomModelsForProvider(appSettings, "codex"),
      claudeAgent: getCustomModelsForProvider(appSettings, "claudeAgent"),
    }),
    [appSettings],
  );
  const modelOptions = getAppModelOptions(
    modelMenuProvider,
    customModelsByProvider[modelMenuProvider],
    modelMenuProvider === draftProvider ? draftModel : undefined,
  );
  const providerOptionsForDispatch = useMemo(
    () => getProviderStartOptions(appSettings),
    [appSettings],
  );
  const gitTextGenerationModelOptions = useMemo(
    () =>
      getAppModelOptions("codex", appSettings.customCodexModels, appSettings.textGenerationModel),
    [appSettings.customCodexModels, appSettings.textGenerationModel],
  );
  const currentGitTextGenerationModel =
    appSettings.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
  const isGitRepo = gitBranchList?.isRepo ?? true;
  const hasOriginRemote = gitBranchList?.hasOriginRemote ?? false;
  const visibleGitBranches = useMemo(
    () => dedupeRemoteBranchesWithLocalMatches(gitBranchList?.branches ?? []),
    [gitBranchList?.branches],
  );
  const currentBranch = gitBranchList?.branches.find((branch) => branch.current)?.name ?? null;
  const resolvedComposerBranch = resolveComposerBranchValue({
    envMode: effectiveThreadEnvMode,
    activeWorktreePath,
    activeThreadBranch,
    currentGitBranch: gitStatus?.branch ?? currentBranch,
  });
  const composerBranchLabel = branchTriggerLabel({
    activeWorktreePath,
    effectiveEnvMode: effectiveThreadEnvMode,
    branch: resolvedComposerBranch,
  });
  const isGitStatusOutOfSync =
    !!gitStatus?.branch && !!currentBranch && gitStatus.branch !== currentBranch;
  const gitStatusForActions = isGitStatusOutOfSync ? null : gitStatus;
  const isDefaultBranch = useMemo(() => {
    const branchName = gitStatusForActions?.branch;
    if (!branchName) return false;
    const current = gitBranchList?.branches.find((branch) => branch.name === branchName);
    return current?.isDefault ?? (branchName === "main" || branchName === "master");
  }, [gitBranchList?.branches, gitStatusForActions?.branch]);
  const gitQuickAction = useMemo(
    () => resolveQuickAction(gitStatusForActions, gitActionBusy, isDefaultBranch, hasOriginRemote),
    [gitActionBusy, gitStatusForActions, hasOriginRemote, isDefaultBranch],
  );
  const gitMenuItems = useMemo<TuiGitMenuItem[]>(() => {
    if (!gitCwd || !isGitRepo) {
      return [];
    }
    const items: TuiGitMenuItem[] = [];
    if (gitQuickAction.kind === "run_pull") {
      items.push({
        id: "pull",
        label: "Pull",
        icon: "󰓂",
        disabled: gitQuickAction.disabled,
        kind: "pull",
      });
    }
    for (const item of buildGitActionMenuItems(
      gitStatusForActions,
      gitActionBusy,
      hasOriginRemote,
    )) {
      const action =
        item.dialogAction === "commit"
          ? "commit"
          : item.dialogAction === "push"
            ? "commit_push"
            : item.dialogAction === "create_pr"
              ? "commit_push_pr"
              : undefined;
      items.push({
        id: item.id,
        label: item.label,
        icon: gitMenuItemIcon(item),
        disabled: item.disabled,
        kind: item.kind === "open_pr" ? "open_pr" : "action",
        ...(action ? { action } : {}),
      });
    }
    return items;
  }, [gitActionBusy, gitCwd, gitQuickAction, gitStatusForActions, hasOriginRemote, isGitRepo]);
  const isGitTextGenerationModelDirty =
    currentGitTextGenerationModel !==
    (DEFAULT_APP_SETTINGS.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL);
  const selectedThemeLabel =
    THEME_OPTIONS.find((option) => option === appSettings.theme) === "system"
      ? "System"
      : appSettings.theme === "light"
        ? "Light"
        : "Dark";
  const selectedThreadEnvLabel =
    appSettings.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local";
  const composerEnvMenuItems: ComposerEnvMenuItem[] = ENV_MODE_OPTIONS.map((option) => ({
    id: option.value,
    label: option.label,
    icon: option.icon,
    selected: effectiveThreadEnvMode === option.value,
    onSelect: () => {
      void applyComposerEnvMode(option.value);
    },
  }));
  const composerBranchMenuItems = useMemo<ComposerBranchMenuItem[]>(
    () =>
      visibleGitBranches.map((branch) => {
        const hasSecondaryWorktree =
          !!branch.worktreePath && branch.worktreePath !== activeProjectCwd;
        return {
          id: branch.name,
          label: branch.name,
          branch,
          selected: branch.name === resolvedComposerBranch,
          ...(((branch.current
            ? "current"
            : hasSecondaryWorktree
              ? "worktree"
              : branch.isRemote
                ? "remote"
                : branch.isDefault
                  ? "default"
                  : undefined) as string | undefined)
            ? {
                trailingLabel: branch.current
                  ? "current"
                  : hasSecondaryWorktree
                    ? "worktree"
                    : branch.isRemote
                      ? "remote"
                      : "default",
              }
            : {}),
        };
      }),
    [activeProjectCwd, resolvedComposerBranch, visibleGitBranches],
  );
  const selectedCustomModelProviderLabel =
    MODEL_PROVIDER_SETTINGS.find((entry) => entry.provider === selectedCustomModelProvider)
      ?.title ?? "Codex";
  const selectedGitTextGenerationModelLabel =
    gitTextGenerationModelOptions.find((option) => option.slug === currentGitTextGenerationModel)
      ?.name ?? currentGitTextGenerationModel;
  const totalCustomModels =
    appSettings.customCodexModels.length + appSettings.customClaudeModels.length;
  const isInstallSettingsDirty =
    appSettings.claudeBinaryPath !== DEFAULT_APP_SETTINGS.claudeBinaryPath ||
    appSettings.codexBinaryPath !== DEFAULT_APP_SETTINGS.codexBinaryPath ||
    appSettings.codexHomePath !== DEFAULT_APP_SETTINGS.codexHomePath;
  const savedCustomModelRows = MODEL_PROVIDER_SETTINGS.flatMap((providerSettings) =>
    getCustomModelsForProvider(appSettings, providerSettings.provider).map((slug) => ({
      key: `${providerSettings.provider}:${slug}`,
      provider: providerSettings.provider,
      providerTitle: providerSettings.title,
      slug,
    })),
  );
  const visibleCustomModelRows = showAllCustomModels
    ? savedCustomModelRows
    : savedCustomModelRows.slice(0, 5);
  const settingsSelectItems = useMemo(() => {
    switch (settingsSelectKind) {
      case "theme":
        return THEME_OPTIONS.map((option) => ({
          id: option,
          label: option === "system" ? "System" : option === "light" ? "Light" : "Dark",
          selected: appSettings.theme === option,
          onSelect: () => {
            updateAppSettings({ theme: option });
            setOverlayMenu(null);
          },
        }));
      case "timestamp-format":
        return TIMESTAMP_FORMAT_OPTIONS.map((option) => ({
          id: option,
          label: TIMESTAMP_FORMAT_LABELS[option],
          selected: appSettings.timestampFormat === option,
          onSelect: () => {
            updateAppSettings({ timestampFormat: option });
            setOverlayMenu(null);
          },
        }));
      case "thread-env":
        return (["local", "worktree"] as const).map((option) => ({
          id: option,
          label: option === "worktree" ? "New worktree" : "Local",
          selected: appSettings.defaultThreadEnvMode === option,
          onSelect: () => {
            updateAppSettings({ defaultThreadEnvMode: option });
            setOverlayMenu(null);
          },
        }));
      case "git-model":
        return gitTextGenerationModelOptions.map((option) => ({
          id: option.slug,
          label: option.name,
          selected: option.slug === currentGitTextGenerationModel,
          onSelect: () => {
            updateAppSettings({ textGenerationModel: option.slug });
            setOverlayMenu(null);
          },
        }));
      case "custom-model-provider":
        return MODEL_PROVIDER_SETTINGS.map((option) => ({
          id: option.provider,
          label: option.title,
          selected: selectedCustomModelProvider === option.provider,
          onSelect: () => {
            setSelectedCustomModelProvider(option.provider);
            setOverlayMenu(null);
          },
        }));
    }
  }, [
    appSettings.defaultThreadEnvMode,
    appSettings.theme,
    appSettings.timestampFormat,
    currentGitTextGenerationModel,
    gitTextGenerationModelOptions,
    selectedCustomModelProvider,
    settingsSelectKind,
    updateAppSettings,
  ]);
  const sidebarSortItems = useMemo<SidebarSortMenuItem[]>(
    () => [
      ...(
        Object.entries(SIDEBAR_PROJECT_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>
      ).map(([value, label]) => ({
        id: `project:${value}`,
        section: "Sort projects" as const,
        label,
        selected:
          (appSettings.sidebarProjectSortOrder ?? DEFAULT_SIDEBAR_PROJECT_SORT_ORDER) === value,
        onSelect: () => {
          updateAppSettings({ sidebarProjectSortOrder: value });
          setOverlayMenu(null);
          setStatus(`Projects sorted by ${label.toLowerCase()}`);
        },
      })),
      ...(
        Object.entries(SIDEBAR_THREAD_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
      ).map(([value, label]) => ({
        id: `thread:${value}`,
        section: "Sort threads" as const,
        label,
        selected:
          (appSettings.sidebarThreadSortOrder ?? DEFAULT_SIDEBAR_THREAD_SORT_ORDER) === value,
        onSelect: () => {
          updateAppSettings({ sidebarThreadSortOrder: value });
          setOverlayMenu(null);
          setStatus(`Threads sorted by ${label.toLowerCase()}`);
        },
      })),
    ],
    [
      appSettings.sidebarProjectSortOrder,
      appSettings.sidebarThreadSortOrder,
      setStatus,
      updateAppSettings,
    ],
  );
  const changedSettingLabels = [
    ...(appSettings.theme !== DEFAULT_APP_THEME ? ["Theme"] : []),
    ...(appSettings.timestampFormat !== DEFAULT_TIMESTAMP_FORMAT ? ["Time format"] : []),
    ...(appSettings.sidebarProjectSortOrder !== DEFAULT_SIDEBAR_PROJECT_SORT_ORDER
      ? ["Project sort"]
      : []),
    ...(appSettings.sidebarThreadSortOrder !== DEFAULT_SIDEBAR_THREAD_SORT_ORDER
      ? ["Thread sort"]
      : []),
    ...(appSettings.enableAssistantStreaming !== DEFAULT_APP_SETTINGS.enableAssistantStreaming
      ? ["Assistant output"]
      : []),
    ...(appSettings.defaultThreadEnvMode !== DEFAULT_APP_SETTINGS.defaultThreadEnvMode
      ? ["New threads"]
      : []),
    ...(appSettings.confirmThreadDelete !== DEFAULT_APP_SETTINGS.confirmThreadDelete
      ? ["Delete confirmation"]
      : []),
    ...(isGitTextGenerationModelDirty ? ["Text generation model"] : []),
    ...(totalCustomModels > 0 ? ["Custom models"] : []),
    ...(isInstallSettingsDirty ? ["Provider installs"] : []),
  ];
  const headerTitleMaxLength = Math.max(
    12,
    Math.min(
      HEADER_THREAD_TITLE_MAX_LENGTH,
      mainPanelColumns -
        (responsiveLayout.showSidebarToggle ? 6 : 0) -
        (responsiveLayout.showHeaderProjectBadge ? 20 : 4),
    ),
  );
  const activeThreadDisplayTitle = truncateTitleForDisplay(
    (mainView === "settings"
      ? "Settings"
      : mainView === "keybindings"
        ? "Keybindings"
        : activeThread?.title) ??
      (activeDraftThread ? "New thread" : activeProject?.title) ??
      "New thread",
    headerTitleMaxLength,
  );
  const projectSelectedIndex = activeProjectId
    ? Math.max(
        sortedProjects.findIndex((project) => project.id === activeProjectId),
        0,
      )
    : 0;
  const threadSelectedIndex = activeThreadId
    ? Math.max(
        threads.findIndex((thread) => thread.id === activeThreadId),
        0,
      )
    : 0;

  useEffect(() => {
    if (responsiveLayout.showSidebar) {
      setSidebarOverlayOpen(false);
      return;
    }
    if (sidebarContextMenu) {
      closeSidebarContextMenu();
    }
    if (focusArea === "projects" || focusArea === "threads") {
      setFocusArea(
        mainView !== "thread"
          ? "settings"
          : showFullDiffView
            ? "diff"
            : activeThreadId
              ? "timeline"
              : "composer",
      );
    }
  }, [
    activeThreadId,
    focusArea,
    mainView,
    responsiveLayout.showSidebar,
    setSidebarOverlayOpen,
    showFullDiffView,
    sidebarContextMenu,
  ]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    if (projects.length === 0) {
      if (selectedProjectId) setSelectedProjectId(undefined);
      return;
    }
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(sortedProjects[0]?.id);
    }
  }, [projects, selectedProjectId, snapshot, sortedProjects]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const nextExpandedProjectIds = pruneExpandedProjects(
      expandedProjectIds,
      projects.map((project) => project.id),
    );
    if (nextExpandedProjectIds !== expandedProjectIds) {
      setExpandedProjectIds(nextExpandedProjectIds);
    }
  }, [expandedProjectIds, projects, snapshot]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    if (threads.length === 0) {
      if (selectedThreadId && !isDraftThreadId(selectedThreadId)) {
        setSelectedThreadId(undefined);
      }
      return;
    }
    if (
      pendingCreatedThreadId &&
      selectedThreadId === pendingCreatedThreadId &&
      !threads.some((thread) => thread.id === pendingCreatedThreadId)
    ) {
      return;
    }
    if (
      selectedThreadId &&
      !isDraftThreadId(selectedThreadId) &&
      !threads.some((thread) => thread.id === selectedThreadId)
    ) {
      setSelectedThreadId(threads[0]?.id);
    }
  }, [pendingCreatedThreadId, selectedThreadId, snapshot, threads]);

  useEffect(() => {
    if (!pendingCreatedThreadId) return;
    if (
      shouldClearPendingCreatedThread({
        pendingCreatedThreadId,
        selectedThreadId,
        threadIds: threads.map((thread) => thread.id),
      })
    ) {
      setPendingCreatedThreadId(null);
    }
  }, [pendingCreatedThreadId, selectedThreadId, threads]);

  useEffect(() => {
    if (!selectedThreadId || !isDraftThreadId(selectedThreadId)) return;
    const selectedDraftThread = Object.values(draftThreadsByProjectId).find(
      (draftThread) => draftThread.id === selectedThreadId,
    );
    if (!selectedDraftThread) {
      setSelectedThreadId(undefined);
      return;
    }
    if (activeProjectId === selectedDraftThread.projectId) return;
    setSelectedThreadId(undefined);
  }, [activeProjectId, draftThreadsByProjectId, selectedThreadId]);

  useEffect(() => {
    if (!showAssistantTyping) return;
    const timer = setInterval(() => {
      setSendAnimationTick((current) => current + 1);
      setPendingSends((current) =>
        current.filter((entry) => {
          const thread = allThreads.find((candidate) => candidate.id === entry.threadId);
          if (!thread) return true;
          const userMessagePersisted = thread.messages.some(
            (message) => message.id === entry.messageId,
          );
          if (userMessagePersisted) {
            return false;
          }
          const assistantReplyStarted = thread.messages.some((message) => {
            if (message.role !== "assistant") return false;
            return Date.parse(message.createdAt) >= Date.parse(entry.createdAt);
          });
          return !assistantReplyStarted || Date.now() < entry.visibleUntil;
        }),
      );
    }, SEND_ANIMATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [allThreads, showAssistantTyping]);

  useEffect(() => {
    if (!hasPulsingThreadStatus) return;
    const timer = setInterval(() => {
      setSidebarPulseTick((current) => current + 1);
    }, SIDEBAR_STATUS_PULSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPulsingThreadStatus]);

  useEffect(() => {
    if (!activeThread) return;
    const nextProvider = activeThread.session?.providerName;
    const resolvedProvider =
      nextProvider === "codex" || nextProvider === "claudeAgent" ? nextProvider : draftProvider;
    if (resolvedProvider !== draftProvider) {
      setDraftProvider(resolvedProvider);
    }
    setDraftModel(resolvePersistedModel(resolvedProvider, activeThread.model));
    setDraftRuntimeMode(activeThread.runtimeMode);
    setDraftInteractionMode(activeThread.interactionMode);
  }, [activeThread, draftProvider]);

  useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjectIds((current) => ensureProjectExpanded(current, activeProjectId));
  }, [activeProjectId]);

  useEffect(() => {
    setLocallyUnreadThreadIds((current) => clearLocallyUnreadThread(current, activeThreadId));
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThread) return;
    const completedAt = activeThread.latestTurn?.completedAt;
    if (!completedAt) return;
    const completedAtMs = Date.parse(completedAt);
    if (Number.isNaN(completedAtMs)) return;
    const existingVisitedAt = locallyVisitedThreads[activeThread.id];
    const existingVisitedAtMs = existingVisitedAt ? Date.parse(existingVisitedAt) : NaN;
    if (!Number.isNaN(existingVisitedAtMs) && existingVisitedAtMs >= completedAtMs) {
      return;
    }
    const visitedAt = new Date().toISOString();
    setLocallyVisitedThreads((current) => ({
      ...current,
      [activeThread.id]: visitedAt,
    }));
  }, [activeThread, locallyVisitedThreads]);

  useEffect(() => {
    if (selectedThreadIds.size === 0) return;
    const liveThreadIds = new Set<string>(allThreads.map((thread) => thread.id));
    const staleThreadIds = [...selectedThreadIds].filter(
      (threadId) => !liveThreadIds.has(threadId),
    );
    if (staleThreadIds.length > 0) {
      const next = removeFromThreadSelection(
        {
          selectedThreadIds,
          anchorThreadId: selectionAnchorThreadId,
        },
        staleThreadIds,
      );
      setSelectedThreadIds(next.selectedThreadIds);
      setSelectionAnchorThreadId(next.anchorThreadId);
    }
  }, [allThreads, selectedThreadIds, selectionAnchorThreadId]);

  useEffect(() => {
    const liveThreadIds = new Set<string>(allThreads.map((thread) => thread.id));
    setLocallyUnreadThreadIds((current) => pruneLocallyUnreadThreadIds(current, liveThreadIds));
    setLocallyVisitedThreads((current) => pruneLocalThreadVisitedState(current, liveThreadIds));
  }, [allThreads]);

  useEffect(() => {
    let cancelled = false;

    if (!projectPathPromptOpen) {
      setProjectPathSuggestions([]);
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      void (async () => {
        const suggestions = await listDirectorySuggestions(projectPathDraft, paths.homeDir);
        if (!cancelled) {
          setProjectPathSuggestions(suggestions);
        }
      })();
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paths.homeDir, projectPathDraft, projectPathPromptOpen]);

  useEffect(() => {
    if (!projectPathPromptOpen) return;
    setTimeout(() => {
      projectPathRef.current?.focus();
      projectPathRef.current?.selectAll();
    }, 0);
  }, [projectPathPromptOpen, projectPathResetKey]);

  const refreshDiff = useMemo(
    () => async () => {
      if (!api || !activeThread) return;
      const checkpointCount = activeThread.checkpoints.length;
      logger.log("diff.refresh", {
        threadId: activeThread.id,
        checkpoints: checkpointCount,
      });

      if (checkpointCount < 1) {
        setDiffText("");
        setStatus("No diff yet");
        logger.log("diff.skipped", {
          threadId: activeThread.id,
          reason: "no-checkpoints",
        });
        return;
      }

      try {
        const result = await api.orchestration.getFullThreadDiff({
          threadId: activeThread.id,
          toTurnCount: checkpointCount,
        });
        setDiffText(result.diff);
        setStatus("Diff ready");
        logger.log("diff.loaded", {
          threadId: activeThread.id,
          length: result.diff.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load diff.";
        setDiffText("");
        setStatus("Diff unavailable");
        logger.log("diff.loadFailed", {
          threadId: activeThread.id,
          checkpoints: checkpointCount,
          message,
        });
      }
    },
    [activeThread, api, logger],
  );

  useEffect(() => {
    if (!diffOpen || !activeThread) return;
    void refreshDiff();
  }, [activeThread, diffOpen, refreshDiff]);

  useEffect(() => {
    const liveKeys = new Set(diffFiles.map((file) => file.key));
    setCollapsedDiffFileKeys((current) => {
      const next = new Set<string>();
      for (const key of current) {
        if (liveKeys.has(key)) {
          next.add(key);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [diffFiles]);

  function syncComposerFromTextarea() {
    scheduleDeferredComposerSync({
      state: deferredComposerSyncRef.current,
      onSync: () => {
        const nextValue = composerRef.current?.plainText ?? "";
        composerValueRef.current = nextValue;
        setComposer(nextValue);
        if (activePendingProgress?.activeQuestion) {
          const questionId = activePendingProgress.activeQuestion.id;
          const requestId = activePendingUserInput?.requestId;
          if (requestId) {
            setPendingUserInputAnswersByRequestId((current) => ({
              ...current,
              [requestId]: {
                ...current[requestId],
                [questionId]: {
                  ...current[requestId]?.[questionId],
                  customAnswer: nextValue,
                },
              },
            }));
          }
        }
      },
    });
  }

  function syncComposerValueRefSoon() {
    queueMicrotask(() => {
      composerValueRef.current = composerRef.current?.plainText ?? composerValueRef.current;
    });
  }

  function readComposerValue(): string {
    return composerRef.current?.plainText ?? composerValueRef.current ?? composer;
  }

  function resetComposerTextarea(nextValue: string) {
    invalidateDeferredComposerSync(deferredComposerSyncRef.current);
    composerValueRef.current = nextValue;
    setComposer(nextValue);
    setComposerResetKey((current) => current + 1);
  }

  function insertComposerText(value: string) {
    composerRef.current?.insertText(value);
    const nextValue = composerRef.current?.plainText ?? `${readComposerValue()}${value}`;
    composerValueRef.current = nextValue;
    setComposer(nextValue);
  }

  function setLatestSubmittedRecovery(threadId: string, recovery: InterruptedTurnRecovery | null) {
    setLastSubmittedByThreadId((current) => {
      const next = { ...current };
      if (recovery) {
        next[threadId] = recovery;
      } else {
        delete next[threadId];
      }
      lastSubmittedByThreadIdRef.current = next;
      return next;
    });
  }

  function focusComposer(options?: { selectAll?: boolean }) {
    setFocusArea("composer");
    setTimeout(() => {
      composerRef.current?.focus();
      if (options?.selectAll) {
        composerRef.current?.selectAll();
      }
      setTimeout(() => {
        composerRef.current?.focus();
        if (options?.selectAll) {
          composerRef.current?.selectAll();
        }
      }, 0);
    }, 0);
  }

  function applyInterruptedTurnRecovery(recovery: InterruptedTurnRecovery) {
    resetComposerTextarea(recovery.text);
    setComposerMentions(recovery.mentions.map(cloneComposerMention));
    setComposerAttachments(recovery.attachments.map(cloneDraftAttachment));
    setComposerAttachmentDeleteArmed(false);
    setPathSuggestionEntries([]);
    setPathSuggestionIndex(0);
    setSuppressedInterruptedTurnsByThreadId((current) => ({
      ...current,
      [recovery.threadId]: [
        ...(current[recovery.threadId] ?? []).filter(
          (entry) => entry.turnId !== recovery.turnId && entry.messageId !== recovery.messageId,
        ),
        {
          turnId: recovery.turnId,
          messageId: recovery.messageId,
        },
      ],
    }));
    setPendingSends((current) => current.filter((entry) => entry.messageId !== recovery.messageId));
    setLatestSubmittedRecovery(recovery.threadId, recovery);
    setStatus("Canceled response restored to composer");
    focusComposer({ selectAll: true });
  }

  const requestAppExit = useCallback(() => {
    setConfirmDialog({
      title: "Quit T1 Code?",
      body: "Press Ctrl-C again or Enter to quit. Press Escape to stay in the session.",
      confirmLabel: "Quit",
      escapeBehavior: "cancel",
      ctrlCBehavior: "confirm",
      onConfirm: async () => {
        onRequestExit?.();
      },
    });
  }, [onRequestExit]);

  const clearComposerDraft = useCallback(() => {
    resetComposerTextarea("");
    setComposerAttachmentDeleteArmed(false);
    setPathSuggestionEntries([]);
    setPathSuggestionIndex(0);
    if (activePendingProgress?.activeQuestion && activePendingUserInput?.requestId) {
      const questionId = activePendingProgress.activeQuestion.id;
      const requestId = activePendingUserInput.requestId;
      setPendingUserInputAnswersByRequestId((current) => ({
        ...current,
        [requestId]: {
          ...current[requestId],
          [questionId]: {
            ...current[requestId]?.[questionId],
            customAnswer: "",
          },
        },
      }));
    }
    setStatus("Composer cleared");
  }, [activePendingProgress, activePendingUserInput]);

  function isComposerFocused(): boolean {
    return focusArea === "composer" && !imagePasteInFlight && !activePendingApproval;
  }

  useEffect(() => {
    if (interruptRequestToken > 0) {
      if (confirmDialog?.confirmLabel === "Quit") {
        const action = confirmDialog.onConfirm;
        setConfirmDialog(null);
        void action();
        return;
      }
      const composerValue = composerRef.current?.plainText ?? composerValueRef.current ?? composer;
      if (
        shouldClearComposerOnCtrlC({
          keyName: "c",
          ctrl: true,
          composerFocused:
            focusArea === "composer" && !imagePasteInFlight && !activePendingApproval,
          hasComposerText: composerValue.length > 0,
        })
      ) {
        clearComposerDraft();
        return;
      }
      requestAppExit();
    }
  }, [
    activePendingApproval,
    clearComposerDraft,
    composer,
    confirmDialog,
    focusArea,
    imagePasteInFlight,
    interruptRequestToken,
    requestAppExit,
  ]);

  function applyComposerPathMention(entry: ProjectEntry) {
    const trigger = detectTrailingComposerPathTrigger(readComposerValue());
    if (!trigger) {
      return;
    }
    const nextComposer = replaceComposerTextRange(
      readComposerValue(),
      trigger.rangeStart,
      trigger.rangeEnd,
      "",
    ).replace(/[ \t]{2,}/g, " ");
    addComposerMention(entry);
    resetComposerTextarea(nextComposer);
    setPathSuggestionEntries([]);
    setPathSuggestionIndex(0);
    setFocusArea("composer");
    setStatus("File tagged");
    setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  }

  function addComposerAttachments(attachments: ReadonlyArray<DraftComposerImageAttachment>) {
    if (attachments.length === 0) {
      return;
    }
    setComposerAttachments((current) => mergeChatAttachments(current, attachments));
  }

  function addComposerMention(entry: ProjectEntry) {
    const nextMention: ComposerMention = {
      type: "path",
      path: entry.path,
      kind: entry.kind,
      ...(entry.parentPath ? { parentPath: entry.parentPath } : {}),
    };
    setComposerMentions((current) => {
      if (current.some((mention) => mention.path === nextMention.path)) {
        return current;
      }
      return [...current, nextMention];
    });
  }

  function removeLastComposerAttachment() {
    setComposerAttachmentDeleteArmed(false);
    setComposerAttachments((current) => current.slice(0, -1));
  }

  function removeLastComposerMention() {
    setComposerAttachmentDeleteArmed(false);
    setComposerMentions((current) => current.slice(0, -1));
  }

  const persistComposerDraftForThread = useCallback(
    (threadId: string | undefined, nextText: string) => {
      if (!threadId) {
        return;
      }
      const nextDraft: ComposerDraftState | null =
        nextText.length > 0 || composerMentions.length > 0 || composerAttachments.length > 0
          ? {
              text: nextText,
              mentions: composerMentions.map(cloneComposerMention),
              attachments: composerAttachments.map(cloneDraftAttachment),
            }
          : null;
      setComposerDraftsByThreadId((current) => {
        const existing = current[threadId];
        const existingMatches =
          existing &&
          nextDraft &&
          existing.text === nextDraft.text &&
          existing.mentions.length === nextDraft.mentions.length &&
          existing.mentions.every(
            (mention, index) =>
              mentionSignature(mention) === mentionSignature(nextDraft.mentions[index]!),
          ) &&
          existing.attachments.length === nextDraft.attachments.length &&
          existing.attachments.every(
            (attachment, index) =>
              attachmentSignature(attachment) ===
              attachmentSignature(nextDraft.attachments[index]!),
          );
        if (existingMatches) {
          return current;
        }
        if (!nextDraft && !existing) {
          return current;
        }
        const next = { ...current };
        if (nextDraft) {
          next[threadId] = nextDraft;
        } else {
          delete next[threadId];
        }
        return next;
      });
    },
    [composerAttachments, composerMentions],
  );

  const resolvePreviewFilePath = useCallback(
    async (attachment: ComposerImageAttachment): Promise<string> => {
      const cacheKey =
        "id" in attachment && typeof attachment.id === "string"
          ? attachment.id
          : attachmentSignature(attachment);
      const cachedPath = previewAttachmentCacheRef.current.get(cacheKey);
      if (cachedPath) {
        return cachedPath;
      }

      if ("localPath" in attachment && typeof attachment.localPath === "string") {
        previewAttachmentCacheRef.current.set(cacheKey, attachment.localPath);
        return attachment.localPath;
      }

      if (!("id" in attachment) || typeof attachment.id !== "string") {
        throw new Error("This image preview is not available yet.");
      }

      if (!serverHttpOrigin) {
        throw new Error("The local attachment server is not ready.");
      }

      const filePath = await cacheRemoteAttachmentToFile({
        attachment: {
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
        },
        baseUrl: serverHttpOrigin,
        cacheDir: path.join(paths.imagesDir, "preview-cache"),
      });
      previewAttachmentCacheRef.current.set(cacheKey, filePath);
      return filePath;
    },
    [paths.imagesDir, serverHttpOrigin],
  );

  function closeImagePreview() {
    clearTerminalImagePreview(terminalRenderer);
    setImagePreview(null);
    setFocusArea("composer");
  }

  function openImagePreview(attachment: ComposerImageAttachment) {
    setImagePreview({
      attachment,
      filePath: null,
      status: "loading",
      error: null,
    });
    setFocusArea("timeline");
  }

  useEffect(() => {
    const deferredComposerSync = deferredComposerSyncRef.current;
    return () => {
      invalidateDeferredComposerSync(deferredComposerSync);
    };
  }, []);

  useEffect(() => {
    setComposerAttachmentDeleteArmed(false);
    clearTerminalImagePreview(terminalRenderer);
    setImagePreview(null);
    setShowScrollToBottom(false);
  }, [activeProjectId, activeThreadId, terminalRenderer]);

  useEffect(() => {
    if (!prefsReady) {
      return;
    }
    if (!activeThreadId) {
      resetComposerTextarea("");
      setComposerMentions([]);
      setComposerAttachments([]);
      return;
    }
    const persistedDraft = composerDraftsByThreadIdRef.current[activeThreadId];
    const nextDraft = persistedDraft ? cloneComposerDraftState(persistedDraft) : null;
    resetComposerTextarea(nextDraft?.text ?? "");
    setComposerMentions(nextDraft?.mentions ?? []);
    setComposerAttachments(nextDraft?.attachments ?? []);
    setComposerAttachmentDeleteArmed(false);
  }, [activeThreadId, prefsReady]);

  useEffect(() => {
    if (!prefsReady || !activeThreadId) {
      return;
    }
    if (activePendingUserInput) {
      return;
    }
    persistComposerDraftForThread(activeThreadId, composer);
  }, [
    activeThreadId,
    activePendingUserInput,
    composer,
    composerAttachments,
    composerMentions,
    persistComposerDraftForThread,
    prefsReady,
  ]);

  useEffect(() => {
    if (!activePendingUserInput) {
      return;
    }
    const activeQuestionId = activePendingProgress?.activeQuestion?.id;
    const customAnswer =
      activeQuestionId && activePendingUserInputAnswers[activeQuestionId]
        ? (activePendingUserInputAnswers[activeQuestionId]?.customAnswer ?? "")
        : "";
    resetComposerTextarea(customAnswer);
  }, [
    activePendingProgress?.activeQuestion?.id,
    activePendingUserInput,
    activePendingUserInput?.requestId,
    activePendingUserInputAnswers,
  ]);

  useEffect(() => {
    const openApprovalIds = new Set(approvals.map((approval) => String(approval.requestId)));
    setRespondingRequestIds((current) =>
      current.filter((requestId) => openApprovalIds.has(String(requestId))),
    );
  }, [approvals]);

  useEffect(() => {
    const openRequestIds = new Set(userInputs.map((input) => String(input.requestId)));
    setRespondingUserInputRequestIds((current) =>
      current.filter((requestId) => openRequestIds.has(String(requestId))),
    );
    setPendingUserInputQuestionIndexByRequestId((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([requestId]) => openRequestIds.has(requestId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setPendingUserInputAnswersByRequestId((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([requestId]) => openRequestIds.has(requestId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [userInputs]);

  const syncTimelineScrollState = useCallback(() => {
    const scrollbox = timelineScrollRef.current;
    if (!scrollbox) {
      setShowScrollToBottom(false);
      return;
    }
    const viewportHeight = scrollbox.viewport.height;
    const distanceFromBottom = scrollbox.scrollHeight - viewportHeight - scrollbox.scrollTop;
    const isNearBottom = distanceFromBottom <= TIMELINE_SCROLL_BOTTOM_THRESHOLD_ROWS;
    setShowScrollToBottom(!isNearBottom);
  }, []);

  const scheduleTimelineScrollStateSync = useCallback(() => {
    process.nextTick(() => {
      syncTimelineScrollState();
    });
  }, [syncTimelineScrollState]);

  const scrollTimelineToBottom = useCallback(() => {
    const scrollbox = timelineScrollRef.current;
    if (!scrollbox) {
      return;
    }
    const nextScrollTop = Math.max(scrollbox.scrollHeight - scrollbox.viewport.height, 0);
    scrollbox.scrollTop = nextScrollTop;
    setShowScrollToBottom(false);
    scheduleTimelineScrollStateSync();
  }, [scheduleTimelineScrollStateSync]);

  useEffect(() => {
    process.nextTick(() => {
      scrollTimelineToBottom();
    });
  }, [activeProjectId, activeThreadId, scrollTimelineToBottom]);

  useEffect(() => {
    if (composer.length > 0 || composerAttachments.length === 0) {
      setComposerAttachmentDeleteArmed(false);
    }
  }, [composer, composerAttachments.length]);

  useEffect(() => {
    if (!imagePreview || imagePreview.status !== "loading") {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const filePath = await resolvePreviewFilePath(imagePreview.attachment);
        if (cancelled) {
          return;
        }
        setImagePreview((current) =>
          current && current.attachment === imagePreview.attachment
            ? { ...current, filePath, status: "ready" }
            : current,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        setImagePreview((current) =>
          current && current.attachment === imagePreview.attachment
            ? {
                ...current,
                status: "error",
                error: error instanceof Error ? error.message : String(error),
              }
            : current,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePreview, resolvePreviewFilePath]);

  useEffect(() => {
    syncTimelineScrollState();
  }, [
    activePendingSends.length,
    approvals.length,
    mainView,
    showAssistantTyping,
    syncTimelineScrollState,
    timelineEntries.length,
    userInputs.length,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      syncTimelineScrollState();
    }, 120);
    return () => {
      clearInterval(interval);
    };
  }, [syncTimelineScrollState]);

  async function attachClipboardImage(): Promise<void> {
    if (activePendingUserInput) {
      setStatus("Image attachments are disabled while questions are pending");
      return;
    }

    if (imagePasteInFlight) {
      setStatus("Image paste already in progress");
      return;
    }

    setImagePasteInFlight(true);
    try {
      const filePath = await saveClipboardImageToFile(paths.imagesDir);
      if (!filePath) {
        setStatus(
          process.platform === "darwin"
            ? "No image found on clipboard"
            : process.platform === "linux"
              ? "No clipboard image found, or no Linux clipboard helper is installed"
              : "Clipboard images are not supported on this platform",
        );
        return;
      }

      const attachment = await resolveImageAttachmentFromPath({
        filePath,
        homeDir: paths.homeDir,
      });
      if (!attachment) {
        throw new Error(`Clipboard image could not be resolved from ${filePath}.`);
      }

      addComposerAttachments([{ ...attachment, localPath: filePath }]);
      setStatus("Image attached");
      logger.log("composer.pasteImageAttachment", {
        filePath,
        name: attachment.name,
        sizeBytes: attachment.sizeBytes,
      });
    } catch (error) {
      logger.log("composer.pasteImageFailed", {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatus("Clipboard image paste failed");
    } finally {
      setImagePasteInFlight(false);
    }
  }

  async function handleComposerPaste(event: PasteEvent) {
    logger.log("composer.paste");
    if (activePendingApproval) {
      event.preventDefault();
      setStatus("Resolve approval first");
      return;
    }
    syncComposerFromTextarea();
    const fallbackText = stripAnsiSequences(decodePasteBytes(event.bytes));
    if (fallbackText.length > 0) {
      event.preventDefault();
      const resolvedSubmission = await resolveComposerSubmission({
        text: fallbackText,
        homeDir: paths.homeDir,
      });
      if (resolvedSubmission.attachments.length > 0) {
        addComposerAttachments(resolvedSubmission.attachments);
        if (resolvedSubmission.promptText.length > 0) {
          insertComposerText(resolvedSubmission.promptText);
        }
        setStatus(
          resolvedSubmission.attachments.length === 1
            ? "Image attached"
            : `${resolvedSubmission.attachments.length} images attached`,
        );
        return;
      }

      insertComposerText(fallbackText);
      return;
    }

    event.preventDefault();
    await attachClipboardImage();
  }

  function syncProjectPathFromTextarea() {
    setTimeout(() => {
      const nextValue = projectPathRef.current?.plainText ?? "";
      setProjectPathDraft(nextValue);
    }, 0);
  }

  function openProjectPathPrompt(initialValue = process.cwd()) {
    setOverlayMenu(null);
    closeSidebarContextMenu();
    setConfirmDialog(null);
    setRenameThreadDialog(null);
    setFocusArea("projects");
    setProjectPathError(null);
    setProjectPathDraft(initialValue);
    setProjectPathResetKey((current) => current + 1);
    setProjectPathPromptOpen(true);
  }

  function closeProjectPathPrompt() {
    setProjectPathPromptOpen(false);
    setProjectPathBusy(false);
    setProjectPathError(null);
    setProjectPathSuggestions([]);
  }

  function closeSidebarContextMenu() {
    setSidebarContextMenu(null);
  }

  function clearSelection() {
    const next = clearThreadSelection();
    setSelectedThreadIds(next.selectedThreadIds);
    setSelectionAnchorThreadId(next.anchorThreadId);
  }

  function toggleSelectedThread(threadId: string) {
    const next = toggleThreadSelection(
      {
        selectedThreadIds,
        anchorThreadId: selectionAnchorThreadId,
      },
      threadId,
    );
    setSelectedThreadIds(next.selectedThreadIds);
    setSelectionAnchorThreadId(next.anchorThreadId);
  }

  function rangeSelectThread(threadId: string, orderedThreadIds: readonly string[]) {
    const next = rangeSelectThreads(
      {
        selectedThreadIds,
        anchorThreadId: selectionAnchorThreadId,
      },
      threadId,
      orderedThreadIds,
    );
    setSelectedThreadIds(next.selectedThreadIds);
    setSelectionAnchorThreadId(next.anchorThreadId);
  }

  function removeThreadsFromSelection(threadIds: readonly string[]) {
    const next = removeFromThreadSelection(
      {
        selectedThreadIds,
        anchorThreadId: selectionAnchorThreadId,
      },
      threadIds,
    );
    setSelectedThreadIds(next.selectedThreadIds);
    setSelectionAnchorThreadId(next.anchorThreadId);
  }

  function selectProject(projectId: string) {
    persistComposerDraftForThread(activeThreadId, readComposerValue());
    setSelectedProjectId(projectId);
    const selectedDraftThread =
      selectedThreadId && isDraftThreadId(selectedThreadId)
        ? Object.values(draftThreadsByProjectId).find(
            (draftThread) => draftThread.id === selectedThreadId,
          )
        : null;
    if (selectedDraftThread && selectedDraftThread.projectId !== projectId) {
      setSelectedThreadId(undefined);
    }
    setMainView("thread");
    setFocusArea("projects");
  }

  function selectThread(projectId: string, threadId: string) {
    persistComposerDraftForThread(activeThreadId, readComposerValue());
    setSelectedProjectId(projectId);
    setSelectedThreadId(threadId);
    setMainView("thread");
    setFocusArea("threads");
    setExpandedProjectIds((current) => ensureProjectExpanded(current, projectId));
    setLocallyUnreadThreadIds((current) => clearLocallyUnreadThread(current, threadId));
  }

  function openProjectContextMenu(projectId: string, event: SidebarMouseEvent) {
    if (selectedThreadIds.size > 0) {
      clearSelection();
    }
    setOverlayMenu(null);
    setFocusArea("projects");
    setSidebarContextMenu({
      kind: "project",
      projectId,
      x: event.x ?? 2,
      y: event.y ?? 2,
      selectedIndex: 0,
    });
  }

  function openThreadContextMenu(projectId: string, threadId: string, event: SidebarMouseEvent) {
    setOverlayMenu(null);
    setFocusArea("threads");
    if (selectedThreadIds.size > 0 && selectedThreadIds.has(threadId)) {
      setSidebarContextMenu({
        kind: "multi-thread",
        threadIds: [...selectedThreadIds],
        x: event.x ?? 2,
        y: event.y ?? 2,
        selectedIndex: 0,
      });
      return;
    }
    if (selectedThreadIds.size > 0) {
      clearSelection();
    }
    setSidebarContextMenu({
      kind: "thread",
      projectId,
      threadId,
      x: event.x ?? 2,
      y: event.y ?? 2,
      selectedIndex: 0,
    });
  }

  async function deleteThread(threadId: string) {
    await dispatch({
      type: "thread.delete",
      commandId: newCommandId(),
      threadId: threadId as never,
    });
    setLocallyUnreadThreadIds((current) => clearLocallyUnreadThread(current, threadId));
    removeThreadsFromSelection([threadId]);
    if (selectedThreadId === threadId) {
      setSelectedThreadId(undefined);
      setFocusArea("threads");
    }
    setStatus("Thread deleted");
  }

  async function deleteThreads(threadIds: readonly string[]) {
    const deletedIds = new Set(threadIds);
    for (const threadId of threadIds) {
      await dispatch({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId: threadId as never,
      });
      setLocallyUnreadThreadIds((current) => clearLocallyUnreadThread(current, threadId));
      if (selectedThreadId === threadId) {
        setSelectedThreadId(undefined);
      }
    }
    removeThreadsFromSelection([...deletedIds]);
    setFocusArea("threads");
    setStatus("Threads deleted");
  }

  async function removeProject(projectId: string) {
    await dispatch({
      type: "project.delete",
      commandId: newCommandId(),
      projectId: projectId as never,
    });
    if (selectedProjectId === projectId) {
      setSelectedProjectId(undefined);
      setSelectedThreadId(undefined);
      setFocusArea("projects");
    }
    setExpandedProjectIds((current) => collapseProject(current, projectId));
    setStatus("Project removed");
  }

  function promptConfirm(input: ConfirmDialogState) {
    closeSidebarContextMenu();
    setOverlayMenu(null);
    setConfirmDialog(input);
  }

  async function submitRenameThread() {
    if (!renameThreadDialog) return;
    const trimmed = renameThreadDialog.value.trim();
    const thread = allThreads.find((candidate) => candidate.id === renameThreadDialog.threadId);
    if (!thread) {
      setRenameThreadDialog(null);
      return;
    }
    if (!trimmed) {
      setStatus("Thread title required");
      return;
    }
    if (trimmed === thread.title) {
      setRenameThreadDialog(null);
      return;
    }
    await dispatch({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId: thread.id as never,
      title: trimmed,
    });
    setRenameThreadDialog(null);
    setStatus("Thread renamed");
  }

  async function handleThreadContextAction(
    actionId: SidebarContextMenuActionId,
    thread: ThreadReadModel,
  ) {
    closeSidebarContextMenu();

    if (actionId === "rename") {
      setRenameThreadDialog({ threadId: thread.id, value: thread.title });
      return;
    }

    if (actionId === "generate-title") {
      await dispatch({
        type: "thread.title.generate",
        commandId: newCommandId(),
        threadId: thread.id as never,
        createdAt: nowIso(),
      });
      setStatus("Generating title");
      return;
    }

    if (actionId === "mark-unread") {
      setLocallyUnreadThreadIds((current) => markThreadUnreadLocally(current, thread));
      setLocallyVisitedThreads((current) => {
        if (!(thread.id in current)) return current;
        const next = { ...current };
        delete next[thread.id];
        return next;
      });
      setStatus("Marked unread");
      return;
    }

    if (actionId === "copy-path") {
      const workspacePath =
        thread.worktreePath ??
        projects.find((project) => project.id === thread.projectId)?.workspaceRoot ??
        null;
      if (!workspacePath) {
        setStatus("Path unavailable");
        return;
      }
      await copyToClipboard(workspacePath, "Path copied");
      return;
    }

    if (actionId === "copy-thread-id") {
      await copyToClipboard(thread.id, "Thread ID copied");
      return;
    }

    if (actionId === "delete") {
      if (!appSettings.confirmThreadDelete) {
        await deleteThread(thread.id);
        return;
      }
      promptConfirm({
        title: `Delete thread "${thread.title}"?`,
        body: "This permanently clears conversation history for this thread.",
        confirmLabel: "Delete",
        onConfirm: async () => {
          await deleteThread(thread.id);
        },
      });
    }
  }

  async function handleMultiThreadContextAction(
    actionId: SidebarContextMenuActionId,
    threadIds: readonly string[],
  ) {
    closeSidebarContextMenu();
    if (actionId === "mark-unread") {
      const threads = allThreads.filter((thread) => threadIds.includes(thread.id));
      setLocallyUnreadThreadIds((current) => {
        let next = current;
        for (const thread of threads) {
          next = markThreadUnreadLocally(next, thread);
        }
        return next;
      });
      setLocallyVisitedThreads((current) => {
        let changed = false;
        const next = { ...current };
        for (const threadId of threadIds) {
          if (threadId in next) {
            delete next[threadId];
            changed = true;
          }
        }
        return changed ? next : current;
      });
      clearSelection();
      setStatus("Marked unread");
      return;
    }

    if (actionId === "delete") {
      if (!appSettings.confirmThreadDelete) {
        await deleteThreads(threadIds);
        return;
      }
      promptConfirm({
        title: `Delete ${threadIds.length} thread${threadIds.length === 1 ? "" : "s"}?`,
        body: "This permanently clears conversation history for these threads.",
        confirmLabel: "Delete",
        onConfirm: async () => {
          await deleteThreads(threadIds);
        },
      });
    }
  }

  async function handleProjectContextAction(
    actionId: SidebarContextMenuActionId,
    project: ProjectReadModel,
  ) {
    closeSidebarContextMenu();
    if (actionId !== "delete") return;

    const projectThreads = threadsByProject.get(project.id) ?? [];
    const confirmSteps = buildProjectRemovalConfirmSteps(project.title, projectThreads.length);
    const promptStep = (stepIndex: number) => {
      const step = confirmSteps[stepIndex];
      if (!step) return;
      promptConfirm({
        title: step.title,
        ...(step.body ? { body: step.body } : {}),
        confirmLabel: step.confirmLabel,
        onConfirm: async () => {
          const nextStep = stepIndex + 1;
          if (nextStep < confirmSteps.length) {
            promptStep(nextStep);
            return;
          }
          await removeProject(project.id);
        },
      });
    };

    promptStep(0);
  }

  async function promptDeleteFocusedThreads() {
    if (selectedThreadIds.size > 0) {
      await handleMultiThreadContextAction("delete", [...selectedThreadIds]);
      return;
    }
    if (activeThread) {
      await handleThreadContextAction("delete", activeThread);
    }
  }

  function handleThreadClick(
    event: SidebarMouseEvent,
    projectId: string,
    threadId: string,
    orderedProjectThreadIds: readonly string[],
  ) {
    const isModClick = Boolean(event.modifiers?.ctrl);
    const isShiftClick = Boolean(event.modifiers?.shift);

    if (isModClick) {
      toggleSelectedThread(threadId);
      setFocusArea("threads");
      return;
    }

    if (isShiftClick) {
      rangeSelectThread(threadId, orderedProjectThreadIds);
      setFocusArea("threads");
      return;
    }

    if (selectedThreadIds.size > 0) {
      clearSelection();
    }
    setSelectionAnchorThreadId(threadId);
    selectThread(projectId, threadId);
  }

  function extendThreadSelectionWithKeyboard(delta: -1 | 1) {
    if (threads.length === 0) return;
    const currentThreadId = activeThreadId ?? threads[0]?.id;
    if (!currentThreadId) return;
    const currentIndex = Math.max(
      threads.findIndex((thread) => thread.id === currentThreadId),
      0,
    );
    const nextIndex = Math.min(threads.length - 1, Math.max(0, currentIndex + delta));
    const nextThread = threads[nextIndex];
    if (!nextThread) return;

    if (selectedThreadIds.size === 0) {
      const initialSelection = new Set<string>([currentThreadId]);
      const nextSelection = rangeSelectThreads(
        {
          selectedThreadIds: initialSelection,
          anchorThreadId: currentThreadId,
        },
        nextThread.id,
        threads.map((thread) => thread.id),
      );
      setSelectedThreadIds(nextSelection.selectedThreadIds);
      setSelectionAnchorThreadId(nextSelection.anchorThreadId);
    } else {
      rangeSelectThread(
        nextThread.id,
        threads.map((thread) => thread.id),
      );
    }

    setSelectedThreadId(nextThread.id);
    setFocusArea("threads");
  }

  useKeyboard((key) => {
    const ctrlCPressed = isCtrlC({
      keyName: key.name,
      ctrl: key.ctrl,
    });
    const isNavUp = key.name === "up" || (key.ctrl && key.name === "k");
    const isNavDown = key.name === "down" || (key.ctrl && key.name === "j");
    const hasDismissibleLayer = Boolean(
      confirmDialog ||
      renameThreadDialog ||
      imagePreview ||
      showSidebarOverlay ||
      projectPathPromptOpen ||
      overlayMenu ||
      sidebarContextMenu,
    );
    logger.log("ui.key", {
      name: key.name,
      ctrl: key.ctrl,
      shift: key.shift,
      meta: key.meta,
      super: key.super ?? false,
      source: key.source,
      sequence: key.sequence,
    });
    if (confirmDialog && key.name === "escape") {
      key.preventDefault();
      if (confirmDialog.escapeBehavior === "confirm") {
        const action = confirmDialog.onConfirm;
        setConfirmDialog(null);
        void action();
        return;
      }
      setConfirmDialog(null);
      return;
    }
    if (confirmDialog && ctrlCPressed) {
      key.preventDefault();
      if (confirmDialog.ctrlCBehavior === "confirm") {
        const action = confirmDialog.onConfirm;
        setConfirmDialog(null);
        void action();
        return;
      }
      setConfirmDialog(null);
      return;
    }
    if (
      confirmDialog &&
      (key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed")
    ) {
      key.preventDefault();
      const action = confirmDialog.onConfirm;
      setConfirmDialog(null);
      void action();
      return;
    }
    if (renameThreadDialog && key.name === "escape") {
      setRenameThreadDialog(null);
      return;
    }
    if (imagePreview && key.name === "escape") {
      closeImagePreview();
      return;
    }
    if (showSidebarOverlay && key.name === "escape") {
      setSidebarOverlayOpen(false);
      setFocusArea(activeThreadId ? "timeline" : "composer");
      return;
    }
    if (confirmDialog || renameThreadDialog) {
      return;
    }
    if (
      activePendingProgress?.activeQuestion &&
      !activePendingIsResponding &&
      !key.ctrl &&
      !key.meta
    ) {
      const digit = Number.parseInt(key.name, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
        const option = activePendingProgress.activeQuestion.options[digit - 1];
        if (option && composer.trim().length === 0) {
          selectActivePendingUserInputOption(activePendingProgress.activeQuestion.id, option.label);
          if (!activePendingProgress.isLastQuestion) {
            setTimeout(() => {
              setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
            }, 150);
          }
          return;
        }
      }
    }
    if (projectPathPromptOpen && key.name === "escape") {
      closeProjectPathPrompt();
      return;
    }
    if (projectPathPromptOpen && key.name === "tab") {
      return;
    }
    if (overlayMenu && key.name === "escape") {
      logger.log("overlay.close", { menu: overlayMenu, reason: "escape" });
      setOverlayMenu(null);
      setFocusArea("composer");
      return;
    }
    if (sidebarContextMenu && key.name === "escape") {
      closeSidebarContextMenu();
      return;
    }
    if (
      shouldInterruptComposerOnEscape({
        keyName: key.name,
        hasDismissibleLayer,
        showStopAction: activeThreadIsRunning,
      })
    ) {
      key.preventDefault();
      void interruptActiveTurn();
      return;
    }
    if (
      isCtrlShiftA({
        keyName: key.name,
        ctrl: key.ctrl,
        shift: key.shift,
      }) &&
      !hasDismissibleLayer &&
      !isComposerFocused()
    ) {
      key.preventDefault();
      focusComposer({ selectAll: true });
      return;
    }
    if (ctrlCPressed && !hasDismissibleLayer && !isComposerFocused()) {
      key.preventDefault();
      requestAppExit();
      return;
    }
    if (sidebarContextMenu) {
      const menuItems =
        sidebarContextMenu.kind === "thread"
          ? buildThreadContextMenuItems()
          : sidebarContextMenu.kind === "multi-thread"
            ? buildMultiSelectContextMenuItems(sidebarContextMenu.threadIds.length)
            : buildProjectContextMenuItems();
      if (isNavUp) {
        setSidebarContextMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex: Math.max(0, current.selectedIndex - 1),
              }
            : current,
        );
        return;
      }
      if (isNavDown) {
        setSidebarContextMenu((current) =>
          current
            ? {
                ...current,
                selectedIndex: Math.min(menuItems.length - 1, current.selectedIndex + 1),
              }
            : current,
        );
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        key.preventDefault();
        const selectedItem = menuItems[sidebarContextMenu.selectedIndex];
        if (!selectedItem) return;
        if (sidebarContextMenu.kind === "thread") {
          const thread = allThreads.find((entry) => entry.id === sidebarContextMenu.threadId);
          if (thread) {
            void handleThreadContextAction(selectedItem.id, thread);
          }
        } else if (sidebarContextMenu.kind === "multi-thread") {
          void handleMultiThreadContextAction(selectedItem.id, sidebarContextMenu.threadIds);
        } else if (sidebarContextMenu.kind === "project") {
          const project = projects.find((entry) => entry.id === sidebarContextMenu.projectId);
          if (project) {
            void handleProjectContextAction(selectedItem.id, project);
          }
        }
        return;
      }
    }
    if (overlayMenu === "model") {
      const availableProviders = AVAILABLE_MODEL_PROVIDER_OPTIONS.map((option) => option.value);
      if (key.name === "left" || key.name === "right") {
        const nextProvider = modelMenuProvider === "codex" ? "claudeAgent" : "codex";
        focusModelProvider(nextProvider);
        logger.log("overlay.modelProviderChanged", { provider: nextProvider });
        return;
      }
      if (isNavUp) {
        if (!modelSubmenuOpen) {
          const currentIndex = Math.max(availableProviders.indexOf(modelMenuProvider), 0);
          const nextProvider = availableProviders[Math.max(0, currentIndex - 1)];
          if (nextProvider) {
            focusModelProvider(nextProvider, false);
          }
          return;
        }
        setModelMenuIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        if (!modelSubmenuOpen) {
          const currentIndex = Math.max(availableProviders.indexOf(modelMenuProvider), 0);
          const nextProvider =
            availableProviders[Math.min(availableProviders.length - 1, currentIndex + 1)];
          if (nextProvider) {
            focusModelProvider(nextProvider, false);
          }
          return;
        }
        setModelMenuIndex((current) => Math.min(modelOptions.length - 1, current + 1));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        if (!modelSubmenuOpen) {
          setModelSubmenuOpen(true);
          return;
        }
        const selected = modelOptions[modelMenuIndex];
        if (selected) {
          applyDraftProviderModel(modelMenuProvider, selected.slug);
        }
        return;
      }
    }
    if (overlayMenu === "settings-select") {
      if (isNavUp) {
        setSettingsSelectIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setSettingsSelectIndex((current) => Math.min(settingsSelectItems.length - 1, current + 1));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        const selected = settingsSelectItems[settingsSelectIndex];
        if (selected) {
          selected.onSelect();
        }
        return;
      }
    }
    if (overlayMenu === "sidebar-sort") {
      if (isNavUp) {
        setSidebarSortIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setSidebarSortIndex((current) => Math.min(sidebarSortItems.length - 1, current + 1));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        sidebarSortItems[sidebarSortIndex]?.onSelect();
        return;
      }
    }
    if (overlayMenu === "git-actions") {
      if (isNavUp) {
        setGitMenuIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setGitMenuIndex((current) => Math.min(gitMenuItems.length - 1, current + 1));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        key.preventDefault();
        void activateGitMenuItem(gitMenuItems[gitMenuIndex]);
        return;
      }
    }
    if (overlayMenu === "composer-env") {
      if (isNavUp) {
        setComposerEnvMenuIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setComposerEnvMenuIndex((current) =>
          Math.min(composerEnvMenuItems.length - 1, current + 1),
        );
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        composerEnvMenuItems[composerEnvMenuIndex]?.onSelect();
        return;
      }
    }
    if (overlayMenu === "composer-branch") {
      if (isNavUp) {
        setComposerBranchMenuIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setComposerBranchMenuIndex((current) =>
          Math.min(composerBranchMenuItems.length - 1, current + 1),
        );
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        key.preventDefault();
        const selected = composerBranchMenuItems[composerBranchMenuIndex];
        if (selected) {
          void selectComposerBranch(selected);
        }
        return;
      }
    }
    if (overlayMenu === "traits") {
      if (traitsMenuItems.length === 0) {
        setOverlayMenu(null);
        return;
      }
      if (isNavUp) {
        setTraitsMenuIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (isNavDown) {
        setTraitsMenuIndex((current) => Math.min(traitsMenuItems.length - 1, current + 1));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        traitsMenuItems[traitsMenuIndex]?.onSelect();
        return;
      }
    }
    if (
      focusArea === "threads" &&
      !key.ctrl &&
      !key.meta &&
      (key.name === "delete" || key.name === "backspace")
    ) {
      if (selectedThreadIds.size === 0 && !activeThread) {
        return;
      }
      key.preventDefault();
      void promptDeleteFocusedThreads();
      return;
    }
    if (focusArea === "projects") {
      if (isNavUp || isNavDown) {
        if (projectPathPromptOpen) return;
        if (projects.length === 0) return;
        const delta = isNavDown ? 1 : -1;
        const nextIndex = Math.min(projects.length - 1, Math.max(0, projectSelectedIndex + delta));
        const nextProject = projects[nextIndex];
        if (nextProject) {
          setSelectedProjectId(nextProject.id);
          setExpandedProjectIds((current) => ensureProjectExpanded(current, nextProject.id));
        }
        return;
      }
      if (key.name === "right") {
        if (activeProjectId) {
          setExpandedProjectIds((current) => ensureProjectExpanded(current, activeProjectId));
        }
        setFocusArea("threads");
        return;
      }
      if (key.name === "left" && activeProjectId) {
        setExpandedProjectIds((current) => collapseProject(current, activeProjectId));
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        if (projectPathPromptOpen) return;
        const primaryAction = resolveProjectPrimaryAction({
          activeProjectId,
          expandedProjectIds,
          threadCount: activeProjectId ? (threadsByProject.get(activeProjectId)?.length ?? 0) : 0,
        });
        if (primaryAction === "open-project-path") {
          openProjectPathPrompt();
        } else if (primaryAction === "expand-project" && activeProjectId) {
          setExpandedProjectIds((current) => ensureProjectExpanded(current, activeProjectId));
        } else if (primaryAction === "focus-threads") {
          setFocusArea("threads");
        } else if (activeProjectId) {
          openDraftThread(activeProjectId);
        }
        return;
      }
    }
    if (focusArea === "threads") {
      if (isNavUp || isNavDown) {
        if (threads.length === 0) return;
        if (key.shift) {
          extendThreadSelectionWithKeyboard(isNavDown ? 1 : -1);
          return;
        }
        const delta = isNavDown ? 1 : -1;
        const nextIndex = Math.min(threads.length - 1, Math.max(0, threadSelectedIndex + delta));
        const nextThread = threads[nextIndex];
        if (nextThread) {
          setSelectedThreadId(nextThread.id);
        }
        return;
      }
      if (key.name === "left") {
        setFocusArea("projects");
        return;
      }
      if (
        key.name === "return" ||
        key.name === "enter" ||
        key.name === "kpenter" ||
        key.name === "linefeed"
      ) {
        if (activeProjectId && !activeThread) {
          openDraftThread(activeProjectId);
        } else {
          setFocusArea(showFullDiffView ? "diff" : "timeline");
        }
        return;
      }
    }
    if (key.ctrl && key.name === "d") {
      toggleDiffView();
    }
    if (key.ctrl && key.name === "b" && responsiveLayout.showSidebarToggle) {
      toggleSidebarVisibility();
      return;
    }
    if (key.ctrl && key.name === "p") {
      setOverlayMenu(null);
      openProjectPathPrompt();
    }
    if (key.ctrl && key.name === "n" && activeProjectId) {
      setOverlayMenu(null);
      openDraftThread(activeProjectId);
    }
    if (key.name === "tab") {
      const order: FocusArea[] =
        mainView !== "thread"
          ? responsiveLayout.showSidebar
            ? ["projects", "settings"]
            : ["settings"]
          : showFullDiffView
            ? responsiveLayout.showSidebar
              ? ["projects", "threads", "diff"]
              : ["diff"]
            : responsiveLayout.showSidebar
              ? ["projects", "threads", "timeline", "controls", "composer", "diff"]
              : ["timeline", "controls", "composer", "diff"];
      const index = order.indexOf(focusArea);
      setFocusArea(
        order[(index + 1) % order.length] ??
          (responsiveLayout.showSidebar ? "projects" : "composer"),
      );
    }
    if (
      focusArea === "timeline" &&
      ["up", "down", "pageup", "pagedown", "home", "end", "j", "k"].includes(key.name)
    ) {
      scheduleTimelineScrollStateSync();
    }
    if (!key.ctrl && key.name === "v" && showFullDiffView && focusArea === "diff") {
      setDiffView((current) => (current === "unified" ? "split" : "unified"));
    }
  });

  async function dispatch(command: ClientOrchestrationCommand) {
    if (!api) return;
    logger.log("command.dispatch", { type: command.type });
    await api.orchestration.dispatchCommand(command);
  }

  function openMainView(view: Exclude<MainView, "thread">) {
    closeSidebarContextMenu();
    closeOverlayMenu();
    setMainView(view);
    setFocusArea("settings");
    setStatus(view === "settings" ? "Settings" : "Keybindings");
  }

  function returnToThreadView() {
    closeSidebarContextMenu();
    closeOverlayMenu();
    setMainView("thread");
    setFocusArea(activeThreadId ? "timeline" : activeProjectId ? "threads" : "projects");
  }

  function openDiffView() {
    closeSidebarContextMenu();
    closeOverlayMenu();
    setDiffOpen(true);
    setFocusArea("diff");
    setStatus("Loading diff...");
  }

  function closeDiffView() {
    closeSidebarContextMenu();
    closeOverlayMenu();
    setDiffOpen(false);
    setFocusArea(activeThreadId ? "timeline" : activeProjectId ? "threads" : "projects");
    setStatus(activeThreadId ? "Timeline" : activeProjectId ? "Threads" : "Projects");
  }

  function toggleSidebarVisibility() {
    closeSidebarContextMenu();
    closeOverlayMenu();
    if (!responsiveLayout.showSidebar) {
      setSidebarOverlayOpen((current) => {
        const next = !current;
        setFocusArea(next ? "projects" : activeThreadId ? "timeline" : "composer");
        setStatus(next ? "Sidebar shown" : "Sidebar hidden");
        return next;
      });
      return;
    }
    setSidebarCollapsedPreference((current) => {
      const next = !current;
      if (next) {
        setFocusArea(
          mainView !== "thread"
            ? "settings"
            : showFullDiffView
              ? "diff"
              : activeThreadId
                ? "timeline"
                : "composer",
        );
        setStatus("Sidebar hidden");
      } else {
        setFocusArea("projects");
        setStatus("Sidebar shown");
      }
      return next;
    });
  }

  function toggleDiffView() {
    logger.log("controls.diffToggle", { next: !diffOpen });
    if (diffOpen) {
      closeDiffView();
      return;
    }
    openDiffView();
  }

  function toggleDiffFile(key: string) {
    setCollapsedDiffFileKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function restoreDefaultSettings() {
    setAppSettings(DEFAULT_APP_SETTINGS);
    setOpenInstallProviders({ codex: false, claudeAgent: false });
    setSelectedCustomModelProvider("codex");
    setCustomModelInputByProvider({ codex: "", claudeAgent: "" });
    setCustomModelErrorByProvider({});
    setShowAllCustomModels(false);
    setOpenKeybindingsError(null);
    setStatus("Settings");
  }

  function addCustomModel(provider: ProviderKind) {
    const customModelInput = customModelInputByProvider[provider];
    const customModels = getCustomModelsForProvider(appSettings, provider);
    const normalized = normalizeModelSlug(customModelInput, provider);
    if (!normalized) {
      setCustomModelErrorByProvider((current) => ({
        ...current,
        [provider]: "Enter a model slug.",
      }));
      return;
    }
    if (getModelOptions(provider).some((option) => option.slug === normalized)) {
      setCustomModelErrorByProvider((current) => ({
        ...current,
        [provider]: "That model is already built in.",
      }));
      return;
    }
    if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
      setCustomModelErrorByProvider((current) => ({
        ...current,
        [provider]: `Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`,
      }));
      return;
    }
    if (customModels.includes(normalized)) {
      setCustomModelErrorByProvider((current) => ({
        ...current,
        [provider]: "That custom model is already saved.",
      }));
      return;
    }

    updateAppSettings(patchCustomModels(provider, [...customModels, normalized]));
    setCustomModelInputByProvider((current) => ({
      ...current,
      [provider]: "",
    }));
    setCustomModelErrorByProvider((current) => ({
      ...current,
      [provider]: null,
    }));
  }

  function removeCustomModel(provider: ProviderKind, slug: string) {
    const customModels = getCustomModelsForProvider(appSettings, provider);
    updateAppSettings(
      patchCustomModels(
        provider,
        customModels.filter((model) => model !== slug),
      ),
    );
    setCustomModelErrorByProvider((current) => ({
      ...current,
      [provider]: null,
    }));
  }

  async function openKeybindingsFile() {
    if (!api || !serverConfig?.keybindingsConfigPath || isOpeningKeybindings) return;
    setOpenKeybindingsError(null);
    setIsOpeningKeybindings(true);
    try {
      const editor = resolvePreferredEditor(serverConfig.availableEditors);
      if (!editor) {
        throw new Error("No available editors found.");
      }
      await api.shell.openInEditor(serverConfig.keybindingsConfigPath, editor);
    } catch (error) {
      setOpenKeybindingsError(
        error instanceof Error ? error.message : "Unable to open keybindings file.",
      );
    } finally {
      setIsOpeningKeybindings(false);
    }
  }

  async function resolveProjectWorkspaceRoot(rawWorkspaceRoot: string): Promise<string> {
    const workspaceRoot = normalizeWorkspaceRoot(rawWorkspaceRoot, paths.homeDir);
    if (!workspaceRoot) {
      throw new Error("Enter a directory path to add a project.");
    }

    let stat;
    try {
      stat = await fs.stat(workspaceRoot);
    } catch {
      throw new Error(`Directory not found: ${workspaceRoot}`);
    }

    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${workspaceRoot}`);
    }

    try {
      return await fs.realpath(workspaceRoot);
    } catch {
      return workspaceRoot;
    }
  }

  async function createProject(rawWorkspaceRoot: string): Promise<string> {
    const workspaceRoot = await resolveProjectWorkspaceRoot(rawWorkspaceRoot);
    const existingProject = projects.find((project) => project.workspaceRoot === workspaceRoot);
    if (existingProject) {
      logger.log("project.selectExisting", {
        workspaceRoot,
        projectId: existingProject.id,
      });
      setSelectedProjectId(existingProject.id);
      setStatus("Ready");
      return existingProject.id;
    }

    const projectId = newProjectId();
    logger.log("project.create", { workspaceRoot, projectId });
    await dispatch({
      type: "project.create",
      commandId: newCommandId(),
      projectId,
      title: basename(workspaceRoot),
      workspaceRoot,
      defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
      createdAt: nowIso(),
    });
    setSelectedProjectId(projectId);
    setSelectedThreadId(undefined);
    setExpandedProjectIds((current) => ensureProjectExpanded(current, projectId));
    setStatus("Project added");
    return projectId;
  }

  async function submitProjectPath(rawWorkspaceRoot: string): Promise<void> {
    if (projectPathBusy) return;
    setProjectPathBusy(true);
    setProjectPathError(null);

    try {
      await createProject(rawWorkspaceRoot);
      closeProjectPathPrompt();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add project from that path.";
      setProjectPathError(message);
      setStatus("Project path");
    } finally {
      setProjectPathBusy(false);
    }
  }

  function applyProjectSuggestion(workspaceRoot: string) {
    setProjectPathDraft(workspaceRoot);
    setProjectPathResetKey((current) => current + 1);
    setProjectPathError(null);
  }

  function openDraftThread(projectId: string): string {
    persistComposerDraftForThread(activeThreadId, readComposerValue());
    const existingDraft =
      draftThreadsByProjectId[projectId] ??
      createDefaultDraftThreadState(
        projectId,
        appSettings.defaultThreadEnvMode,
        currentBranch ?? null,
      );
    setDraftThreadsByProjectId((current) => ({
      ...current,
      [projectId]: existingDraft,
    }));
    setSelectedProjectId(projectId);
    setSelectedThreadId(existingDraft.id);
    setMainView("thread");
    setExpandedProjectIds((current) => ensureProjectExpanded(current, projectId));
    setFocusArea("composer");
    setStatus("New thread");
    setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
    return existingDraft.id;
  }

  async function createThread(
    projectId: string,
    title = DEFAULT_THREAD_TITLE,
    threadContext?: { branch: string | null; worktreePath: string | null },
  ): Promise<string> {
    logger.log("thread.create", { projectId, title });
    const threadId = newThreadId();
    setPendingCreatedThreadId(threadId);
    await dispatch({
      type: "thread.create",
      commandId: newCommandId(),
      threadId,
      projectId: projectId as never,
      title,
      model: draftModel,
      runtimeMode: draftRuntimeMode,
      interactionMode: draftInteractionMode,
      branch: threadContext?.branch ?? null,
      worktreePath: threadContext?.worktreePath ?? null,
      createdAt: nowIso(),
    });
    setSelectedProjectId(projectId);
    setSelectedThreadId(threadId);
    setMainView("thread");
    setDraftThreadsByProjectId((current) => {
      if (!current[projectId]) {
        return current;
      }
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    setExpandedProjectIds((current) => ensureProjectExpanded(current, projectId));
    setFocusArea("composer");
    setStatus("Thread created");
    setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
    return threadId;
  }

  async function persistThreadSettingsForNextTurn(input: {
    threadId: string;
    createdAt: string;
    model: string;
    runtimeMode: RuntimeMode;
    interactionMode: ProviderInteractionMode;
  }) {
    if (!activeThread) {
      return;
    }

    if (input.model !== activeThread.model) {
      await dispatch({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId: input.threadId as never,
        model: input.model,
      });
    }

    if (input.runtimeMode !== activeThread.runtimeMode) {
      await dispatch({
        type: "thread.runtime-mode.set",
        commandId: newCommandId(),
        threadId: input.threadId as never,
        runtimeMode: input.runtimeMode,
        createdAt: input.createdAt,
      });
    }

    if (input.interactionMode !== activeThread.interactionMode) {
      await dispatch({
        type: "thread.interaction-mode.set",
        commandId: newCommandId(),
        threadId: input.threadId as never,
        interactionMode: input.interactionMode,
        createdAt: input.createdAt,
      });
    }
  }

  async function respondToApproval(decision: ProviderApprovalDecision) {
    if (!activeThreadId || !activePendingApproval) {
      return;
    }
    const requestId = activePendingApproval.requestId;
    setRespondingRequestIds((current) =>
      current.includes(requestId) ? current : [...current, requestId],
    );
    try {
      await dispatch({
        type: "thread.approval.respond",
        commandId: newCommandId(),
        threadId: activeThreadId as never,
        requestId,
        decision,
        createdAt: nowIso(),
      });
      setStatus("Approval sent");
    } catch (error) {
      setStatus("Approval failed");
      logger.log("approval.respondFailed", {
        threadId: activeThreadId,
        requestId,
        decision,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRespondingRequestIds((current) => current.filter((entry) => entry !== requestId));
    }
  }

  function setActivePendingUserInputQuestionIndex(nextIndex: number) {
    if (!activePendingUserInput) {
      return;
    }
    setPendingUserInputQuestionIndexByRequestId((current) => ({
      ...current,
      [activePendingUserInput.requestId]: nextIndex,
    }));
  }

  function selectActivePendingUserInputOption(questionId: string, optionLabel: string) {
    if (!activePendingUserInput) {
      return;
    }
    setPendingUserInputAnswersByRequestId((current) => ({
      ...current,
      [activePendingUserInput.requestId]: {
        ...current[activePendingUserInput.requestId],
        [questionId]: {
          selectedOptionLabel: optionLabel,
          customAnswer: "",
        },
      },
    }));
    resetComposerTextarea("");
  }

  async function advanceActivePendingUserInput() {
    if (!activePendingUserInput || !activePendingProgress) {
      return;
    }
    if (!activePendingProgress.isLastQuestion) {
      if (!activePendingProgress.canAdvance) {
        setStatus("Answer required");
        return;
      }
      setActivePendingUserInputQuestionIndex(activePendingProgress.questionIndex + 1);
      return;
    }
    if (!activePendingResolvedAnswers || activePendingIsResponding || !activeThreadId) {
      setStatus("Answer required");
      return;
    }

    const requestId = activePendingUserInput.requestId;
    setRespondingUserInputRequestIds((current) =>
      current.includes(requestId) ? current : [...current, requestId],
    );
    try {
      await dispatch({
        type: "thread.user-input.respond",
        commandId: newCommandId(),
        threadId: activeThreadId as never,
        requestId,
        answers: activePendingResolvedAnswers,
        createdAt: nowIso(),
      });
      setStatus("Answers sent");
      setPendingUserInputAnswersByRequestId((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      setPendingUserInputQuestionIndexByRequestId((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
      const persistedDraft = composerDraftsByThreadIdRef.current[activeThreadId];
      resetComposerTextarea(persistedDraft?.text ?? "");
    } catch (error) {
      setStatus("Answer failed");
      logger.log("userInput.respondFailed", {
        threadId: activeThreadId,
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRespondingUserInputRequestIds((current) => current.filter((entry) => entry !== requestId));
    }
  }

  async function handleSlashCommand(input: string): Promise<boolean> {
    const parsed = parseSlashCommandInput(input);
    if (!parsed) {
      return false;
    }

    const args = parsed.args.trim();

    switch (parsed.command) {
      case "help": {
        setStatus(SLASH_COMMAND_DEFINITIONS.map((item) => `/${item.command}`).join(" "));
        return true;
      }
      case "project": {
        if (args === "cwd") {
          await createProject(process.cwd());
          return true;
        }
        const match = /^add\s+(.+)$/i.exec(args);
        if (!match?.[1]) {
          setStatus("Use /project add <path> or /project cwd");
          return true;
        }
        await createProject(match[1]);
        return true;
      }
      case "thread": {
        const match = /^new(?:\s+(.+))?$/i.exec(args);
        if (!match) {
          setStatus("Use /thread new [title]");
          return true;
        }
        let projectId = activeProjectId;
        if (!projectId) {
          projectId = await createProject(process.cwd());
        }
        if (!projectId) {
          return true;
        }
        await createThread(projectId, match[1]?.trim() || DEFAULT_THREAD_TITLE);
        return true;
      }
      case "provider": {
        const nextProvider =
          args.toLowerCase() === "claude" || args.toLowerCase() === "claudeagent"
            ? "claudeAgent"
            : args.toLowerCase() === "codex"
              ? "codex"
              : null;
        if (!nextProvider) {
          setStatus("Use /provider codex or /provider claude");
          return true;
        }
        applyDraftProviderModel(nextProvider, resolvePersistedModel(nextProvider, draftModel));
        return true;
      }
      case "runtime": {
        const nextMode = normalizePersistedRuntimeMode(args);
        if (!nextMode) {
          setStatus("Use /runtime full-access or /runtime approval-required");
          return true;
        }
        applyDraftRuntimeMode(nextMode);
        return true;
      }
      case "interaction": {
        const nextMode = normalizeInteractionModeArg(args);
        if (!nextMode) {
          setStatus("Use /interaction chat or /interaction plan");
          return true;
        }
        applyDraftInteractionMode(nextMode);
        return true;
      }
      case "diff": {
        openDiffView();
        return true;
      }
      case "implement-plan": {
        if (!latestProposedPlan) {
          setStatus("No plan ready");
          return true;
        }
        resetComposerTextarea(buildPlanImplementationPrompt(latestProposedPlan.planMarkdown));
        setDraftInteractionMode("default");
        setFocusArea("composer");
        return true;
      }
      case "approve": {
        const decision = normalizeApprovalDecision(args);
        if (!decision || !activePendingApproval) {
          setStatus("Use /approve accept|decline|cancel|accept-for-session");
          return true;
        }
        await respondToApproval(decision);
        return true;
      }
      case "answer": {
        if (!activePendingUserInput) {
          setStatus("No pending questions");
          return true;
        }
        const answers = parsePendingUserInputAnswerArgs(args);
        if (!answers) {
          setStatus("Use /answer key=value");
          return true;
        }
        setPendingUserInputAnswersByRequestId((current) => ({
          ...current,
          [activePendingUserInput.requestId]: {
            ...current[activePendingUserInput.requestId],
            ...Object.fromEntries(
              Object.entries(answers).map(([key, value]) => [
                key,
                { selectedOptionLabel: value, customAnswer: "" },
              ]),
            ),
          },
        }));
        const mergedAnswers = buildPendingUserInputAnswers(activePendingUserInput.questions, {
          ...activePendingUserInputAnswers,
          ...Object.fromEntries(
            Object.entries(answers).map(([key, value]) => [
              key,
              { selectedOptionLabel: value, customAnswer: "" },
            ]),
          ),
        });
        if (!mergedAnswers || !activeThreadId) {
          setStatus("More answers needed");
          return true;
        }
        setRespondingUserInputRequestIds((current) =>
          current.includes(activePendingUserInput.requestId)
            ? current
            : [...current, activePendingUserInput.requestId],
        );
        try {
          await dispatch({
            type: "thread.user-input.respond",
            commandId: newCommandId(),
            threadId: activeThreadId as never,
            requestId: activePendingUserInput.requestId,
            answers: mergedAnswers,
            createdAt: nowIso(),
          });
          setStatus("Answers sent");
          const persistedDraft = composerDraftsByThreadIdRef.current[activeThreadId];
          resetComposerTextarea(persistedDraft?.text ?? "");
        } catch (error) {
          setStatus("Answer failed");
          logger.log("userInput.respondFailed", {
            threadId: activeThreadId,
            requestId: activePendingUserInput.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          setRespondingUserInputRequestIds((current) =>
            current.filter((entry) => entry !== activePendingUserInput.requestId),
          );
        }
        return true;
      }
      default:
        return false;
    }
  }

  async function sendPrompt() {
    const rawComposerValue = readComposerValue();
    const trimmedComposerValue = rawComposerValue.trim();
    const standaloneModeCommand = parseStandaloneComposerModeCommand(trimmedComposerValue);
    if (sendInFlightRef.current || imagePasteInFlight) {
      if (imagePasteInFlight) {
        setStatus("Wait for image paste to finish");
      }
      return;
    }
    sendInFlightRef.current = true;
    try {
      if (
        composerAttachments.length === 0 &&
        composerMentions.length === 0 &&
        standaloneModeCommand
      ) {
        applyDraftInteractionMode(standaloneModeCommand);
        resetComposerTextarea("");
        return;
      }
      if (
        composerAttachments.length === 0 &&
        composerMentions.length === 0 &&
        (await handleSlashCommand(trimmedComposerValue))
      ) {
        resetComposerTextarea("");
        return;
      }
      if (activePendingApproval) {
        setStatus("Resolve approval first");
        return;
      }
      if (activePendingUserInput) {
        await advanceActivePendingUserInput();
        return;
      }

      const dispatchModelOptions = getDispatchModelOptions(
        draftProvider,
        draftModel,
        draftModelOptions,
      );
      const serializedMentionText = composerMentions.map((mention) => `@${mention.path}`).join(" ");
      const promptTextForSend =
        serializedMentionText.length > 0
          ? rawComposerValue.trim().length > 0
            ? `${serializedMentionText}\n${rawComposerValue}`
            : `${serializedMentionText} `
          : rawComposerValue;
      logger.log("composer.submitAttempt", {
        activeProjectId: activeProjectId ?? null,
        activeThreadId: activeThread?.id ?? null,
        length: promptTextForSend.trim().length,
        modelOptions: dispatchModelOptions ?? null,
      });

      let projectId = activeProjectId;
      if (!projectId) {
        projectId = await createProject(process.cwd());
      }
      if (!projectId) {
        return;
      }
      const resolvedSubmission = await resolveComposerSubmission({
        text: promptTextForSend,
        homeDir: paths.homeDir,
      });
      const trimmed = resolvedSubmission.promptText.trim();
      const pendingAttachments = mergeChatAttachments(
        composerAttachments,
        resolvedSubmission.attachments,
      );
      if (showPlanFollowUpPrompt && latestProposedPlan && activeThread) {
        const followUp = resolvePlanFollowUpSubmission({
          draftText: trimmed,
          planMarkdown: latestProposedPlan.planMarkdown,
        });
        const messageId = newMessageId();
        const createdAt = nowIso();
        const submittedTurnRecovery: InterruptedTurnRecovery = {
          threadId: activeThread.id,
          turnId: activeThread.latestTurn?.turnId ?? `pending:${messageId}`,
          messageId,
          text: followUp.text,
          mentions: [],
          attachments: [],
          createdAt,
        };
        scrollTimelineToBottom();
        setPendingSends((current) => [
          ...current,
          {
            threadId: activeThread.id,
            messageId,
            text: followUp.text,
            mentions: [],
            attachments: [],
            createdAt,
            visibleUntil: Date.now() + SEND_PLACEHOLDER_MIN_DURATION_MS,
          },
        ]);

        try {
          await persistThreadSettingsForNextTurn({
            threadId: activeThread.id,
            createdAt,
            model: draftModel,
            runtimeMode: draftRuntimeMode,
            interactionMode: followUp.interactionMode,
          });
          await dispatch({
            type: "thread.turn.start",
            commandId: newCommandId(),
            threadId: activeThread.id as never,
            message: {
              messageId,
              role: "user",
              text: followUp.text,
              attachments: [],
            },
            provider: draftProvider,
            model: draftModel,
            ...(dispatchModelOptions ? { modelOptions: dispatchModelOptions } : {}),
            ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
            assistantDeliveryMode: appSettings.enableAssistantStreaming ? "streaming" : "buffered",
            runtimeMode: draftRuntimeMode,
            interactionMode: followUp.interactionMode,
            ...(followUp.interactionMode === "default"
              ? {
                  sourceProposedPlan: {
                    threadId: activeThread.id as never,
                    planId: latestProposedPlan.id,
                  },
                }
              : {}),
            createdAt,
          });
        } catch (error) {
          setPendingSends((current) => current.filter((entry) => entry.messageId !== messageId));
          setStatus("Send failed");
          logger.log("composer.sendFailed", {
            threadId: activeThread.id,
            length: followUp.text.length,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        setSelectedProjectId(projectId);
        setSelectedThreadId(activeThread.id);
        setLatestSubmittedRecovery(activeThread.id, submittedTurnRecovery);
        setDraftInteractionMode(followUp.interactionMode);
        resetComposerTextarea("");
        setComposerMentions([]);
        setComposerAttachments([]);
        setComposerDraftsByThreadId((current) => {
          if (!current[activeThread.id]) {
            return current;
          }
          const next = { ...current };
          delete next[activeThread.id];
          return next;
        });
        setStatus(
          followUp.interactionMode === "default" ? "Implementing plan" : "Plan feedback sent",
        );
        focusComposer();
        logger.log("composer.sent", {
          threadId: activeThread.id,
          length: followUp.text.length,
        });
        return;
      }
      if (!trimmed && pendingAttachments.length === 0) {
        return;
      }
      const submissionAttachments = pendingAttachments.map((attachment) => ({
        type: "image" as const,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        dataUrl: attachment.dataUrl,
      }));
      const inferredSourceProposedPlan =
        activeThread &&
        latestProposedPlan &&
        draftInteractionMode === "default" &&
        trimmed === buildPlanImplementationPrompt(latestProposedPlan.planMarkdown)
          ? {
              threadId: activeThread.id as never,
              planId: latestProposedPlan.id,
            }
          : undefined;

      let nextThreadBranch = activeThreadBranch;
      let nextThreadWorktreePath = activeWorktreePath;
      const shouldCreateWorktree =
        !activeThread &&
        effectiveThreadEnvMode === "worktree" &&
        nextThreadWorktreePath === null &&
        activeProjectCwd !== null;
      if (shouldCreateWorktree) {
        if (!api || !activeProjectCwd) {
          setStatus("Worktree unavailable");
          return;
        }
        if (!nextThreadBranch) {
          setStatus("Select a base branch before sending in New worktree mode");
          return;
        }
        try {
          const result = await api.git.createWorktree({
            cwd: activeProjectCwd,
            branch: nextThreadBranch,
            newBranch: buildTemporaryWorktreeBranchName(),
            path: null,
          });
          nextThreadBranch = result.worktree.branch;
          nextThreadWorktreePath = result.worktree.path;
          if (activeProjectId) {
            upsertDraftThreadContext(activeProjectId, (current) => ({
              ...current,
              branch: result.worktree.branch,
              worktreePath: result.worktree.path,
              envMode: "worktree",
            }));
          }
          await refreshGitState();
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Failed to create worktree");
          logger.log("composer.worktreeCreateFailed", {
            branch: nextThreadBranch,
            cwd: activeProjectCwd,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }

      let threadId: string | undefined = activeThread?.id;
      if (!threadId) {
        threadId = await createThread(projectId, DEFAULT_THREAD_TITLE, {
          branch: nextThreadBranch,
          worktreePath: nextThreadWorktreePath,
        });
      }

      const messageId = newMessageId();
      const createdAt = nowIso();
      const submittedTurnRecovery: InterruptedTurnRecovery = {
        threadId: threadId as string,
        turnId: activeThread?.latestTurn?.turnId ?? `pending:${messageId}`,
        messageId,
        text: trimmed,
        mentions: composerMentions.map(cloneComposerMention),
        attachments: pendingAttachments.map(cloneDraftAttachment),
        createdAt,
      };
      scrollTimelineToBottom();
      setPendingSends((current) => [
        ...current,
        {
          threadId: threadId as string,
          messageId,
          text: trimmed,
          mentions: composerMentions.map(cloneComposerMention),
          attachments: pendingAttachments,
          createdAt,
          visibleUntil: Date.now() + SEND_PLACEHOLDER_MIN_DURATION_MS,
        },
      ]);

      try {
        if (activeThread) {
          await persistThreadSettingsForNextTurn({
            threadId: threadId as string,
            createdAt,
            model: draftModel,
            runtimeMode: draftRuntimeMode,
            interactionMode: draftInteractionMode,
          });
        }
        await dispatch({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadId as never,
          message: {
            messageId,
            role: "user",
            text: trimmed,
            attachments: submissionAttachments,
          },
          provider: draftProvider,
          model: draftModel,
          ...(dispatchModelOptions ? { modelOptions: dispatchModelOptions } : {}),
          ...(providerOptionsForDispatch ? { providerOptions: providerOptionsForDispatch } : {}),
          assistantDeliveryMode: appSettings.enableAssistantStreaming ? "streaming" : "buffered",
          runtimeMode: draftRuntimeMode,
          interactionMode: draftInteractionMode,
          ...(inferredSourceProposedPlan ? { sourceProposedPlan: inferredSourceProposedPlan } : {}),
          createdAt,
        });
      } catch (error) {
        setPendingSends((current) => current.filter((entry) => entry.messageId !== messageId));
        setStatus("Send failed");
        logger.log("composer.sendFailed", {
          threadId,
          length: trimmed.length,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      setSelectedProjectId(projectId);
      setSelectedThreadId(threadId);
      setLatestSubmittedRecovery(threadId as string, submittedTurnRecovery);
      resetComposerTextarea("");
      setComposerMentions([]);
      setComposerAttachments([]);
      setComposerDraftsByThreadId((current) => {
        const activeDraftKey = activeThreadId ?? threadId;
        if (!current[activeDraftKey]) {
          return current;
        }
        const next = { ...current };
        delete next[activeDraftKey];
        return next;
      });
      setStatus("Prompt sent");
      focusComposer();
      logger.log("composer.sent", { threadId, length: trimmed.length });
    } finally {
      sendInFlightRef.current = false;
    }
  }

  async function interruptActiveTurn() {
    if (!activeThread || !canInterruptActiveTurn(activeThread) || interruptInFlightRef.current) {
      return;
    }
    interruptInFlightRef.current = true;
    const latestSubmitted = lastSubmittedByThreadIdRef.current[activeThread.id];
    const activeTurnId =
      activeThread.latestTurn?.turnId ?? activeThread.session?.activeTurnId ?? null;
    logger.log("composer.interruptAttempt", {
      threadId: activeThread.id,
      activeTurnId: activeThread.session?.activeTurnId ?? null,
    });
    try {
      await dispatch({
        type: "thread.turn.interrupt",
        commandId: newCommandId(),
        threadId: activeThread.id,
        createdAt: nowIso(),
      });
      if (latestSubmitted && activeTurnId) {
        applyInterruptedTurnRecovery({
          ...latestSubmitted,
          turnId: activeTurnId,
        });
      }
      setStatus("Stopping");
    } catch (error) {
      setStatus("Stop failed");
      logger.log("composer.interruptFailed", {
        threadId: activeThread.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      interruptInFlightRef.current = false;
    }
  }

  function applyDraftProviderModel(nextProvider: ProviderKind, nextModel: string) {
    logger.log("controls.providerModelChanged", {
      provider: nextProvider,
      model: nextModel,
    });
    setDraftProvider(nextProvider);
    setDraftModel(nextModel);
    setOverlayMenu(null);
    setFocusArea("composer");
    setStatus("model");
  }

  function focusModelProvider(nextProvider: ProviderKind, openSubmenu: boolean = true) {
    const nextOptions = getAppModelOptions(
      nextProvider,
      customModelsByProvider[nextProvider],
      draftModel,
    );
    setModelMenuProvider(nextProvider);
    setModelSubmenuOpen(openSubmenu);
    setModelMenuIndex(
      Math.max(
        nextOptions.findIndex((option) => option.slug === draftModel),
        0,
      ),
    );
  }

  function applyDraftRuntimeMode(nextMode: RuntimeMode) {
    logger.log("controls.runtimeChanged", { runtimeMode: nextMode });
    setOverlayMenu(null);
    setFocusArea("controls");
    setDraftRuntimeMode(nextMode);
    setStatus("runtime");
  }

  function toggleRuntimeMode() {
    applyDraftRuntimeMode(draftRuntimeMode === "full-access" ? "approval-required" : "full-access");
  }

  function applyDraftInteractionMode(nextMode: "default" | "plan") {
    logger.log("controls.interactionChanged", { interactionMode: nextMode });
    setOverlayMenu(null);
    setFocusArea("controls");
    setDraftInteractionMode(nextMode);
    setStatus("interaction");
  }

  function toggleInteractionMode() {
    applyDraftInteractionMode(draftInteractionMode === "default" ? "plan" : "default");
  }

  function upsertDraftThreadContext(
    projectId: string,
    updater: (current: DraftThreadState) => DraftThreadState,
  ): DraftThreadState {
    const existing =
      draftThreadsByProjectIdRef.current[projectId] ??
      createDefaultDraftThreadState(projectId, appSettings.defaultThreadEnvMode);
    const next = updater(existing);
    setDraftThreadsByProjectId((current) => ({
      ...current,
      [projectId]: next,
    }));
    return next;
  }

  async function applyThreadBranchContext(branch: string | null, worktreePath: string | null) {
    if (activeThread) {
      if (
        api &&
        activeThread.session &&
        worktreePath !== activeWorktreePath &&
        activeThread.session.status !== "stopped"
      ) {
        try {
          await dispatch({
            type: "thread.session.stop",
            commandId: newCommandId(),
            threadId: activeThread.id as never,
            createdAt: nowIso(),
          });
        } catch (error) {
          logger.log("thread.sessionStopFailed", {
            threadId: activeThread.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await dispatch({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId: activeThread.id as never,
        branch,
        worktreePath,
      });
      setStatus(branch ? `Branch ${branch}` : "Branch updated");
      return;
    }

    if (!activeProjectId) {
      return;
    }
    upsertDraftThreadContext(activeProjectId, (current) => ({
      ...current,
      branch,
      worktreePath,
      envMode: resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: worktreePath,
        currentWorktreePath: current.worktreePath,
        effectiveEnvMode: effectiveThreadEnvMode,
      }),
    }));
    setStatus(branch ? `Branch ${branch}` : "Branch updated");
  }

  async function applyComposerEnvMode(nextMode: ThreadEnvMode) {
    if (envLocked || activeWorktreePath) {
      return;
    }
    setOverlayMenu(null);
    setOverlayAnchor(null);
    if (!activeProjectId) {
      updateAppSettings({ defaultThreadEnvMode: nextMode });
      setStatus(
        nextMode === "worktree" ? "New threads use worktrees" : "New threads use local mode",
      );
      return;
    }
    const nextDraft = upsertDraftThreadContext(activeProjectId, (current) => ({
      ...current,
      envMode: nextMode,
      worktreePath: nextMode === "local" ? null : current.worktreePath,
      branch: current.branch ?? currentBranch ?? null,
    }));
    setSelectedThreadId(nextDraft.id);
    setFocusArea("composer");
    setStatus(nextMode === "worktree" ? "New worktree mode" : "Local mode");
    setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  }

  function closeOverlayMenu() {
    setOverlayMenu((current) => {
      if (current !== null) {
        logger.log("overlay.close", { menu: current, reason: "dismiss" });
      }
      return null;
    });
  }

  function toggleModelMenu(event?: SidebarMouseEvent) {
    setFocusArea("controls");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "model" ? null : "model";
      if (next === "model") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        focusModelProvider(draftProvider, false);
      } else {
        setOverlayAnchor(null);
        setModelSubmenuOpen(false);
      }
      logger.log(next ? "overlay.open" : "overlay.close", {
        menu: "model",
        provider: draftProvider,
      });
      return next;
    });
  }

  const updateDraftProviderModelOptions = useCallback(
    (
      provider: ProviderKind,
      updater: (current: ProviderModelOptions | undefined) => ProviderModelOptions | undefined,
    ) => {
      setDraftModelOptions((current) => {
        const next = updater(current);
        logger.log("controls.modelOptionsChanged", {
          provider,
          model: draftModel,
          modelOptions: next ?? null,
        });
        return next;
      });
      setStatus("traits");
    },
    [draftModel, logger],
  );

  function toggleTraitsMenu(event?: SidebarMouseEvent) {
    setFocusArea("controls");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "traits" ? null : "traits";
      if (next === "traits") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        setTraitsMenuIndex(0);
      } else {
        setOverlayAnchor(null);
      }
      logger.log(next ? "overlay.open" : "overlay.close", {
        menu: "traits",
        provider: draftProvider,
        model: draftModel,
      });
      return next;
    });
  }

  function toggleComposerEnvMenu(event?: SidebarMouseEvent) {
    if (!activeProjectId) {
      return;
    }
    setFocusArea("controls");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "composer-env" ? null : "composer-env";
      if (next === "composer-env") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        const selectedIndex = Math.max(
          composerEnvMenuItems.findIndex((item) => item.selected),
          0,
        );
        setComposerEnvMenuIndex(selectedIndex);
      } else {
        setOverlayAnchor(null);
      }
      return next;
    });
  }

  function toggleComposerBranchMenu(event?: SidebarMouseEvent) {
    if (!activeProjectCwd || !gitCwd || !isGitRepo) {
      return;
    }
    setFocusArea("controls");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "composer-branch" ? null : "composer-branch";
      if (next === "composer-branch") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        setComposerBranchMenuIndex(0);
      } else {
        setOverlayAnchor(null);
      }
      return next;
    });
  }

  function openSettingsSelectMenu(kind: SettingsSelectKind, event?: SidebarMouseEvent) {
    setFocusArea("settings");
    closeSidebarContextMenu();
    setSettingsSelectKind(kind);
    setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
    setOverlayMenu("settings-select");
    setSettingsSelectIndex(0);
    logger.log("overlay.open", { menu: "settings-select", kind });
  }

  function toggleSidebarSortMenu(event?: SidebarMouseEvent) {
    setFocusArea("projects");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "sidebar-sort" ? null : "sidebar-sort";
      if (next === "sidebar-sort") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        const selectedIndex = Math.max(
          sidebarSortItems.findIndex((item) => item.selected),
          0,
        );
        setSidebarSortIndex(selectedIndex);
      } else {
        setOverlayAnchor(null);
      }
      logger.log(next ? "overlay.open" : "overlay.close", {
        menu: "sidebar-sort",
      });
      return next;
    });
  }

  const refreshGitState = useCallback(async () => {
    if (!api || !gitCwd) {
      setGitStatus(null);
      setGitBranchList(null);
      setGitStateError(null);
      return;
    }
    if (gitRefreshInFlightRef.current) {
      gitRefreshQueuedRef.current = true;
      return;
    }
    gitRefreshInFlightRef.current = true;
    try {
      const [statusResult, branchResult] = await Promise.all([
        api.git.status({ cwd: gitCwd }),
        api.git.listBranches({ cwd: gitCwd }),
      ]);
      setGitStatus(statusResult);
      setGitBranchList(branchResult);
      setGitStateError(null);
    } catch (error) {
      setGitStatus(null);
      setGitBranchList(null);
      setGitStateError(error instanceof Error ? error.message : "Git status unavailable.");
    } finally {
      gitRefreshInFlightRef.current = false;
      if (gitRefreshQueuedRef.current) {
        gitRefreshQueuedRef.current = false;
        void refreshGitState();
      }
    }
  }, [api, gitCwd]);

  useEffect(() => {
    void refreshGitState();
  }, [refreshGitState]);

  useEffect(() => {
    if (!activeThreadGitSyncKey || !gitCwd) {
      return;
    }
    void refreshGitState();
  }, [activeThreadGitSyncKey, gitCwd, refreshGitState]);

  useEffect(() => {
    if (!api) {
      return;
    }
    return api.git.onActionProgress((event: GitActionProgressEvent) => {
      if (!gitCwd || event.cwd !== gitCwd) {
        return;
      }
      if (activeGitActionIdRef.current && event.actionId !== activeGitActionIdRef.current) {
        return;
      }
      if (event.kind === "action_started") {
        setGitActionBusy(true);
        setGitActionStatus("Starting git action...");
        return;
      }
      if (event.kind === "phase_started") {
        setGitActionBusy(true);
        setGitActionStatus(event.label);
        return;
      }
      if (event.kind === "hook_output") {
        setGitActionStatus(event.text);
        return;
      }
      if (event.kind === "action_failed") {
        setGitActionBusy(false);
        setGitActionStatus(null);
        activeGitActionIdRef.current = null;
        setStatus(event.message);
        void refreshGitState();
        return;
      }
      if (event.kind === "action_finished") {
        setGitActionBusy(false);
        setGitActionStatus(null);
        activeGitActionIdRef.current = null;
        setStatus(summarizeGitActionResult(event.action, event.result));
        void refreshGitState();
      }
    });
  }, [api, gitCwd, refreshGitState]);

  useEffect(() => {
    setGitMenuIndex((current) => Math.min(current, Math.max(gitMenuItems.length - 1, 0)));
  }, [gitMenuItems.length]);

  useEffect(() => {
    setComposerEnvMenuIndex((current) =>
      Math.min(current, Math.max(composerEnvMenuItems.length - 1, 0)),
    );
  }, [composerEnvMenuItems.length]);

  useEffect(() => {
    setComposerBranchMenuIndex((current) =>
      Math.min(current, Math.max(composerBranchMenuItems.length - 1, 0)),
    );
  }, [composerBranchMenuItems.length]);

  useEffect(() => {
    if (overlayMenu !== "git-actions") {
      return;
    }
    if (!gitCwd || !isGitRepo) {
      setOverlayMenu(null);
      setOverlayAnchor(null);
    }
  }, [gitCwd, isGitRepo, overlayMenu]);

  useEffect(() => {
    if (overlayMenu === "composer-env" && !activeProjectId) {
      setOverlayMenu(null);
      setOverlayAnchor(null);
    }
  }, [activeProjectId, overlayMenu]);

  useEffect(() => {
    if (overlayMenu === "composer-branch" && (!activeProjectCwd || !gitCwd || !isGitRepo)) {
      setOverlayMenu(null);
      setOverlayAnchor(null);
    }
  }, [activeProjectCwd, gitCwd, isGitRepo, overlayMenu]);

  useEffect(() => {
    if (overlayMenu !== "composer-branch") {
      return;
    }
    const scrollbox = composerBranchScrollRef.current;
    if (!scrollbox) {
      return;
    }
    process.nextTick(() => {
      const nextScrollTop = Math.max(
        0,
        Math.min(
          composerBranchMenuIndex,
          Math.max(scrollbox.scrollHeight - scrollbox.viewport.height, 0),
        ),
      );
      scrollbox.scrollTo({
        x: scrollbox.scrollLeft,
        y: nextScrollTop,
      });
    });
  }, [composerBranchMenuIndex, composerBranchMenuItems.length, overlayMenu]);

  useEffect(() => {
    if (
      effectiveThreadEnvMode !== "worktree" ||
      activeWorktreePath ||
      activeThreadBranch ||
      !currentBranch ||
      activeThread ||
      !activeProjectId
    ) {
      return;
    }
    setDraftThreadsByProjectId((current) => {
      const existing =
        current[activeProjectId] ??
        createDefaultDraftThreadState(activeProjectId, appSettings.defaultThreadEnvMode);
      return {
        ...current,
        [activeProjectId]: {
          ...existing,
          branch: existing.branch ?? currentBranch,
          envMode: "worktree",
        },
      };
    });
  }, [
    activeProjectId,
    appSettings.defaultThreadEnvMode,
    activeThread,
    activeThreadBranch,
    activeWorktreePath,
    currentBranch,
    effectiveThreadEnvMode,
  ]);

  function toggleGitActionsMenu(event?: SidebarMouseEvent) {
    if (!gitCwd || !isGitRepo) {
      return;
    }
    setFocusArea("controls");
    closeSidebarContextMenu();
    setOverlayMenu((current) => {
      const next = current === "git-actions" ? null : "git-actions";
      if (next === "git-actions") {
        setOverlayAnchor({ x: event?.x ?? null, y: event?.y ?? null });
        setGitMenuIndex(0);
      } else {
        setOverlayAnchor(null);
      }
      logger.log(next ? "overlay.open" : "overlay.close", {
        menu: "git-actions",
        cwd: gitCwd,
      });
      return next;
    });
  }

  async function selectComposerBranch(item: ComposerBranchMenuItem) {
    if (!api || !activeProjectCwd || !gitCwd || !isGitRepo) {
      return;
    }
    const { branch } = item;
    const isSelectingWorktreeBase =
      effectiveThreadEnvMode === "worktree" && !envLocked && !activeWorktreePath;

    setOverlayMenu(null);
    setOverlayAnchor(null);

    if (isSelectingWorktreeBase) {
      await applyThreadBranchContext(branch.name, null);
      setFocusArea("composer");
      return;
    }

    const selectionTarget = resolveBranchSelectionTarget({
      activeProjectCwd,
      activeWorktreePath,
      branch,
    });

    if (selectionTarget.reuseExistingWorktree) {
      await applyThreadBranchContext(branch.name, selectionTarget.nextWorktreePath);
      setFocusArea("composer");
      return;
    }

    try {
      const selectedBranchName = branch.isRemote
        ? deriveLocalBranchNameFromRemoteRef(branch.name)
        : branch.name;
      await api.git.checkout({
        cwd: selectionTarget.checkoutCwd,
        branch: branch.name,
      });
      let nextBranchName = selectedBranchName;
      if (branch.isRemote) {
        const status = await api.git.status({ cwd: selectionTarget.checkoutCwd }).catch(() => null);
        if (status?.branch) {
          nextBranchName = status.branch;
        }
      }
      await applyThreadBranchContext(nextBranchName, selectionTarget.nextWorktreePath);
      await refreshGitState();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Branch checkout failed");
      logger.log("composer.branchSelectFailed", {
        branch: branch.name,
        cwd: selectionTarget.checkoutCwd,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setFocusArea("composer");
    }
  }

  async function runGitStackedAction(action: GitStackedAction) {
    if (!api || !gitCwd || gitActionBusy) {
      return;
    }
    const actionId = newCommandId();
    activeGitActionIdRef.current = actionId;
    setGitActionBusy(true);
    setGitActionStatus("Starting git action...");
    closeOverlayMenu();
    try {
      const result = await api.git.runStackedAction({
        actionId,
        cwd: gitCwd,
        action,
        textGenerationModel: currentGitTextGenerationModel,
      });
      activeGitActionIdRef.current = null;
      setGitActionBusy(false);
      setGitActionStatus(null);
      setStatus(summarizeGitActionResult(action, result));
      await refreshGitState();
    } catch (error) {
      activeGitActionIdRef.current = null;
      setGitActionBusy(false);
      setGitActionStatus(null);
      setStatus(error instanceof Error ? error.message : "Git action failed.");
      await refreshGitState();
    }
  }

  async function runGitPull() {
    if (!api || !gitCwd || gitActionBusy) {
      return;
    }
    closeOverlayMenu();
    setGitActionBusy(true);
    setGitActionStatus("Pulling...");
    try {
      const result = await api.git.pull({ cwd: gitCwd });
      setStatus(result.status === "pulled" ? "Pulled" : "Already up to date");
      await refreshGitState();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Pull failed.");
    } finally {
      setGitActionBusy(false);
      setGitActionStatus(null);
    }
  }

  async function openGitPullRequest() {
    const prUrl = gitStatusForActions?.pr?.state === "open" ? gitStatusForActions.pr.url : null;
    if (!prUrl) {
      setStatus("No open PR");
      return;
    }
    closeOverlayMenu();
    try {
      await openExternalUrl(prUrl);
      setStatus("Opened PR");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to open PR.");
    }
  }

  async function activateGitMenuItem(item: TuiGitMenuItem | undefined) {
    if (!item || item.disabled) {
      return;
    }
    if (item.kind === "pull") {
      await runGitPull();
      return;
    }
    if (item.kind === "open_pr") {
      await openGitPullRequest();
      return;
    }
    if (item.action) {
      await runGitStackedAction(item.action);
    }
  }

  const composerBanner = activePendingApproval
    ? { bg: PALETTE.surfaceWarn, text: approvalHint(activePendingApproval) }
    : activePendingUserInput
      ? { bg: PALETTE.surfaceInfo, text: userInputHint(activePendingUserInput) }
      : showPlanFollowUpPrompt && latestProposedPlan
        ? { bg: PALETTE.surfacePlan, text: planHint() }
        : null;
  const composerHasSendableContent =
    activePendingProgress !== null
      ? activePendingProgress.canAdvance
      : composer.trim().length > 0 || composerMentions.length > 0 || composerAttachments.length > 0;
  const composerIsFocused = isComposerFocused();
  const composerPrimaryAction = resolveComposerPrimaryAction({
    activeThreadIsRunning,
    hasSendableContent: composerHasSendableContent,
  });
  const composerTraits = composerTraitsLabel(
    draftProvider,
    draftModel,
    composer,
    draftModelOptions,
  );
  const composerPlaceholder = imagePasteInFlight
    ? "Attaching clipboard image..."
    : activePendingApproval
      ? (activePendingApproval.detail ?? "Resolve this approval request to continue")
      : activePendingProgress
        ? "Type your own answer, or leave this blank to use the selected option"
        : showPlanFollowUpPrompt
          ? "Add feedback to refine the plan, or leave this blank to implement it"
          : !activeThread && composer.trim().length === 0
            ? activeDraftThread
              ? "Start a new thread with a prompt"
              : "Ask for follow-up changes or attach images"
            : COMPOSER_PLACEHOLDER;
  const composerPathTrigger = detectTrailingComposerPathTrigger(composer);
  const showPathSuggestions =
    composerIsFocused &&
    !activePendingUserInput &&
    !activePendingApproval &&
    composerPathTrigger !== null &&
    composerPathTrigger.query.trim().length > 0 &&
    composerSearchCwd !== null;
  const composerTextareaHeight = estimateComposerTextareaHeight({
    text: composer,
    placeholder: composerPlaceholder,
    totalColumns,
    sidebarWidth: responsiveLayout.sidebarWidth,
    showSidebar: responsiveLayout.showSidebar,
  });
  const composerDrawerOffset =
    composerTextareaHeight + 5 + (composerBanner ? 2 : 0) + (showScrollToBottom ? 1 : 0);
  const traitsMenuItems: TraitsMenuItem[] = useMemo(() => {
    if (draftProvider === "codex") {
      const options = getReasoningEffortOptions("codex");
      const defaultReasoningEffort = getDefaultReasoningEffort("codex");
      const { effort, fastModeEnabled } = getCodexTraits(draftModelOptions);
      return [
        ...options.map((option) => ({
          id: `codex-effort-${option}`,
          section: "Reasoning",
          label: `${formatReasoningEffortLabel(option)}${option === defaultReasoningEffort ? " (default)" : ""}`,
          selected: effort === option,
          onSelect: () => {
            updateDraftProviderModelOptions("codex", (current) => {
              const normalized = normalizeCodexModelOptions({
                ...current?.codex,
                reasoningEffort: option,
              });
              return normalized
                ? { ...current, codex: normalized }
                : { ...current, codex: undefined };
            });
          },
        })),
        {
          id: "codex-fast-off",
          section: "Fast Mode",
          label: "Off",
          selected: !fastModeEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("codex", (current) => {
              const normalized = normalizeCodexModelOptions({
                ...current?.codex,
                fastMode: false,
              });
              return normalized
                ? { ...current, codex: normalized }
                : { ...current, codex: undefined };
            });
          },
        },
        {
          id: "codex-fast-on",
          section: "Fast Mode",
          label: "On",
          selected: fastModeEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("codex", (current) => {
              const normalized = normalizeCodexModelOptions({
                ...current?.codex,
                fastMode: true,
              });
              return normalized
                ? { ...current, codex: normalized }
                : { ...current, codex: undefined };
            });
          },
        },
      ];
    }

    const {
      effort,
      thinkingEnabled,
      fastModeEnabled,
      options,
      ultrathinkPromptControlled,
      supportsFastMode,
    } = getClaudeTraits(draftModel, composer, draftModelOptions);
    const defaultReasoningEffort = getDefaultReasoningEffort("claudeAgent");
    const items: TraitsMenuItem[] = [];

    if (effort) {
      for (const option of options) {
        items.push({
          id: `claude-effort-${option}`,
          section: "Reasoning",
          label: `${formatReasoningEffortLabel(option)}${option === defaultReasoningEffort ? " (default)" : ""}`,
          selected: ultrathinkPromptControlled ? option === "ultrathink" : effort === option,
          onSelect: () => {
            if (ultrathinkPromptControlled) {
              return;
            }
            if (option === "ultrathink") {
              const nextPrompt =
                composer.trim().length === 0
                  ? "Ultrathink:\n"
                  : applyClaudePromptEffortPrefix(composer, "ultrathink");
              resetComposerTextarea(nextPrompt);
              setStatus("traits");
              return;
            }
            updateDraftProviderModelOptions("claudeAgent", (current) => {
              const normalized = normalizeClaudeModelOptions(draftModel, {
                ...current?.claudeAgent,
                effort: option,
              });
              return normalized
                ? { ...current, claudeAgent: normalized }
                : { ...current, claudeAgent: undefined };
            });
          },
        });
      }
    } else if (thinkingEnabled !== null) {
      items.push(
        {
          id: "claude-thinking-on",
          section: "Thinking",
          label: "Thinking On (default)",
          selected: thinkingEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("claudeAgent", (current) => {
              const normalized = normalizeClaudeModelOptions(draftModel, {
                ...current?.claudeAgent,
                thinking: true,
              });
              return normalized
                ? { ...current, claudeAgent: normalized }
                : { ...current, claudeAgent: undefined };
            });
          },
        },
        {
          id: "claude-thinking-off",
          section: "Thinking",
          label: "Thinking Off",
          selected: !thinkingEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("claudeAgent", (current) => {
              const normalized = normalizeClaudeModelOptions(draftModel, {
                ...current?.claudeAgent,
                thinking: false,
              });
              return normalized
                ? { ...current, claudeAgent: normalized }
                : { ...current, claudeAgent: undefined };
            });
          },
        },
      );
    }

    if (supportsFastMode) {
      items.push(
        {
          id: "claude-fast-off",
          section: "Fast Mode",
          label: "Off",
          selected: !fastModeEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("claudeAgent", (current) => {
              const normalized = normalizeClaudeModelOptions(draftModel, {
                ...current?.claudeAgent,
                fastMode: false,
              });
              return normalized
                ? { ...current, claudeAgent: normalized }
                : { ...current, claudeAgent: undefined };
            });
          },
        },
        {
          id: "claude-fast-on",
          section: "Fast Mode",
          label: "On",
          selected: fastModeEnabled,
          onSelect: () => {
            updateDraftProviderModelOptions("claudeAgent", (current) => {
              const normalized = normalizeClaudeModelOptions(draftModel, {
                ...current?.claudeAgent,
                fastMode: true,
              });
              return normalized
                ? { ...current, claudeAgent: normalized }
                : { ...current, claudeAgent: undefined };
            });
          },
        },
      );
    }

    return items;
  }, [composer, draftModel, draftModelOptions, draftProvider, updateDraftProviderModelOptions]);
  useEffect(() => {
    if (traitsMenuItems.length === 0) {
      setTraitsMenuIndex(0);
      if (overlayMenu === "traits") {
        setOverlayMenu(null);
      }
      return;
    }
    setTraitsMenuIndex((current) => Math.min(current, traitsMenuItems.length - 1));
  }, [overlayMenu, traitsMenuItems.length]);

  useEffect(() => {
    if (!api || !composerSearchCwd || !showPathSuggestions || !composerPathTrigger) {
      setPathSuggestionEntries([]);
      setPathSuggestionIndex(0);
      setPathSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setPathSuggestionsLoading(true);
    const timer = setTimeout(() => {
      void api.projects
        .searchEntries({
          cwd: composerSearchCwd,
          query: composerPathTrigger.query.trim(),
          limit: COMPOSER_PATH_SUGGESTION_MAX_ITEMS,
        })
        .then((result) => {
          if (cancelled) return;
          setPathSuggestionEntries([...result.entries]);
          setPathSuggestionIndex(0);
        })
        .catch((error) => {
          if (cancelled) return;
          logger.log("composer.pathSuggestionsFailed", {
            cwd: composerSearchCwd,
            query: composerPathTrigger.query.trim(),
            error: error instanceof Error ? error.message : String(error),
          });
          setPathSuggestionEntries([]);
        })
        .finally(() => {
          if (!cancelled) {
            setPathSuggestionsLoading(false);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, composerPathTrigger, composerSearchCwd, logger, showPathSuggestions]);

  useEffect(() => {
    if (overlayMenu === null && overlayAnchor !== null) {
      setOverlayAnchor(null);
    }
  }, [overlayAnchor, overlayMenu]);

  useEffect(() => {
    setSettingsSelectIndex((current) =>
      Math.min(current, Math.max(settingsSelectItems.length - 1, 0)),
    );
  }, [settingsSelectItems.length]);

  useEffect(() => {
    if (overlayMenu !== "settings-select") return;
    const selectedIndex = Math.max(
      settingsSelectItems.findIndex((item) => item.selected),
      0,
    );
    setSettingsSelectIndex(selectedIndex);
  }, [overlayMenu, settingsSelectItems, settingsSelectKind]);

  useEffect(() => {
    if (overlayMenu !== "sidebar-sort") return;
    const selectedIndex = Math.max(
      sidebarSortItems.findIndex((item) => item.selected),
      0,
    );
    setSidebarSortIndex(selectedIndex);
  }, [overlayMenu, sidebarSortItems]);

  useEffect(() => {
    if (focusArea === "composer" && overlayMenu !== null) {
      setOverlayMenu((current) => {
        if (current !== null) {
          logger.log("overlay.close", {
            menu: current,
            reason: "composer-focus",
          });
        }
        return null;
      });
    }
  }, [focusArea, logger, overlayMenu]);

  const modelMenuHeight = Math.min(Math.max(modelOptions.length, 1), 6);
  const modelProvidersHeight =
    2 +
    AVAILABLE_MODEL_PROVIDER_OPTIONS.length +
    (COMING_SOON_MODEL_PROVIDER_OPTIONS.length > 0
      ? 1 + COMING_SOON_MODEL_PROVIDER_OPTIONS.length
      : 0);
  const modelPopupHeight = modelSubmenuOpen
    ? Math.max(modelMenuHeight + 2, modelProvidersHeight) + 2
    : modelProvidersHeight + 2;
  const modelPopupWidth = modelSubmenuOpen
    ? MODEL_POPUP_WIDTH
    : MODEL_POPUP_PROVIDER_COLUMN_WIDTH + 2;
  const settingsSelectMenuHeight = Math.min(Math.max(settingsSelectItems.length, 1), 6);
  const settingsSelectPopupHeight = 3 + settingsSelectMenuHeight;
  const composerEnvPopupWidth = Math.max(
    16,
    composerEnvMenuItems.reduce((width, item) => Math.max(width, item.label.length + 8), 16),
  );
  const composerEnvPopupHeight = composerEnvMenuItems.length + 2;
  const composerBranchPopupWidth = Math.max(
    42,
    composerBranchMenuItems.reduce(
      (width, item) =>
        Math.max(
          width,
          Math.min(truncateTitleForDisplay(item.label, 28).length, 28) +
            (item.trailingLabel?.length ?? 0) +
            10,
        ),
      42,
    ),
  );
  const composerBranchVisibleRowCount = Math.min(Math.max(composerBranchMenuItems.length, 1), 10);
  const composerBranchPopupHeight = composerBranchVisibleRowCount + 2;
  const gitPopupWidth = Math.max(
    24,
    gitMenuItems.reduce((width, item) => Math.max(width, item.label.length + 8), 24),
  );
  const gitPopupHeight = Math.max(gitMenuItems.length, 1) + 3;
  const settingsSelectTitle =
    settingsSelectKind === "theme"
      ? "Theme"
      : settingsSelectKind === "timestamp-format"
        ? "Time format"
        : settingsSelectKind === "thread-env"
          ? "New threads"
          : settingsSelectKind === "custom-model-provider"
            ? "Custom model provider"
            : "Text generation model";
  const settingsSelectPopupWidth = Math.max(
    14,
    settingsSelectItems.reduce(
      (width, item) => Math.max(width, item.label.length + 6),
      settingsSelectTitle.length + 2,
    ),
  );
  const sidebarSortPopupWidth = Math.max(
    24,
    sidebarSortItems.reduce((width, item) => Math.max(width, item.label.length + 6), 24),
  );
  const sidebarSortPopupHeight =
    2 +
    sidebarSortItems.length +
    countDistinctSections(sidebarSortItems) +
    Math.max(countDistinctSections(sidebarSortItems) - 1, 0);
  const traitsPopupHeight =
    POPUP_TRAITS_MENU_BASE_HEIGHT +
    traitsMenuItems.length +
    countDistinctSections(traitsMenuItems) +
    Math.max(countDistinctSections(traitsMenuItems) - 1, 0);
  const sidebarContextMenuItems = sidebarContextMenu
    ? sidebarContextMenu.kind === "thread"
      ? buildThreadContextMenuItems()
      : sidebarContextMenu.kind === "multi-thread"
        ? buildMultiSelectContextMenuItems(sidebarContextMenu.threadIds.length)
        : buildProjectContextMenuItems()
    : [];
  const viewportRows =
    (process.stdout.rows ?? Number(process.env.T1CODE_HEADLESS_HEIGHT ?? 0)) || 48;
  const viewportColumns =
    (process.stdout.columns ?? Number(process.env.T1CODE_HEADLESS_WIDTH ?? 0)) || 160;
  const mainPanelLeft = responsiveLayout.showSidebar ? responsiveLayout.sidebarWidth + 1 : 0;
  const imagePreviewModalWidth = Math.max(48, Math.min(110, viewportColumns - 8));
  const imagePreviewModalHeight = Math.max(18, Math.min(36, viewportRows - 6));
  const imagePreviewModalLeft = Math.max(
    2,
    Math.floor((viewportColumns - imagePreviewModalWidth) / 2),
  );
  const imagePreviewModalTop = Math.max(
    2,
    Math.floor((viewportRows - imagePreviewModalHeight) / 2),
  );
  const imagePreviewCanvasWidth = Math.max(12, imagePreviewModalWidth - 6);
  const imagePreviewCanvasHeight = Math.max(8, imagePreviewModalHeight - 8);
  const imagePreviewCellPixelWidth =
    terminalImageSupport.pixelWidth && viewportColumns > 0
      ? terminalImageSupport.pixelWidth / viewportColumns
      : 0;
  const imagePreviewCellPixelHeight =
    terminalImageSupport.pixelHeight && viewportRows > 0
      ? terminalImageSupport.pixelHeight / viewportRows
      : 0;
  const sidebarContextMenuPosition = sidebarContextMenu
    ? {
        top: Math.max(
          1,
          Math.min(sidebarContextMenu.y, viewportRows - sidebarContextMenuItems.length - 2),
        ),
        left: Math.max(1, Math.min(sidebarContextMenu.x, viewportColumns - 28)),
      }
    : null;
  const fallbackPopupLeft = viewportColumns - POPUP_MENU_WIDTH - POPUP_FALLBACK_RIGHT_OFFSET;
  const modelPopupPosition =
    overlayMenu === "model"
      ? resolvePopupPosition({
          anchorX: overlayAnchor?.x ?? null,
          anchorY: overlayAnchor?.y ?? null,
          width: modelPopupWidth,
          height: modelPopupHeight,
          viewportColumns,
          viewportRows,
          fallbackLeft: viewportColumns - modelPopupWidth - POPUP_FALLBACK_RIGHT_OFFSET,
        })
      : null;
  const traitsPopupPosition =
    overlayMenu === "traits"
      ? resolvePopupPosition({
          anchorX: overlayAnchor?.x ?? null,
          anchorY: overlayAnchor?.y ?? null,
          width: POPUP_MENU_WIDTH,
          height: traitsPopupHeight,
          viewportColumns,
          viewportRows,
          fallbackLeft: fallbackPopupLeft,
        })
      : null;
  const settingsSelectPopupPosition =
    overlayMenu === "settings-select"
      ? resolvePopupPosition({
          anchorX: overlayAnchor?.x ?? null,
          anchorY: overlayAnchor?.y ?? null,
          width: settingsSelectPopupWidth,
          height: settingsSelectPopupHeight,
          viewportColumns,
          viewportRows,
          fallbackLeft: viewportColumns - settingsSelectPopupWidth - POPUP_FALLBACK_RIGHT_OFFSET,
        })
      : null;
  const sidebarSortPopupPosition =
    overlayMenu === "sidebar-sort"
      ? resolvePopupPosition({
          anchorX: overlayAnchor?.x ?? null,
          anchorY: overlayAnchor?.y ?? null,
          width: sidebarSortPopupWidth,
          height: sidebarSortPopupHeight,
          viewportColumns,
          viewportRows,
          fallbackLeft: viewportColumns - sidebarSortPopupWidth - POPUP_FALLBACK_RIGHT_OFFSET,
        })
      : null;
  const gitPopupPosition =
    overlayMenu === "git-actions"
      ? resolvePopupPosition({
          anchorX: overlayAnchor?.x ?? null,
          anchorY: overlayAnchor?.y ?? null,
          width: gitPopupWidth,
          height: gitPopupHeight,
          viewportColumns,
          viewportRows,
          fallbackLeft: viewportColumns - gitPopupWidth - POPUP_FALLBACK_RIGHT_OFFSET,
        })
      : null;
  const composerEnvPopupPosition =
    overlayMenu === "composer-env"
      ? {
          top: Math.max(1, viewportRows - composerEnvPopupHeight - 2),
          left: Math.max(1, mainPanelLeft + 4),
        }
      : null;
  const composerBranchPopupPosition =
    overlayMenu === "composer-branch"
      ? {
          top: Math.max(1, viewportRows - composerBranchPopupHeight - 2),
          left: Math.max(mainPanelLeft + 4, viewportColumns - composerBranchPopupWidth - 4),
        }
      : null;

  useEffect(() => {
    if (!selectionCopyToast) return;
    const timeout = setTimeout(() => {
      setSelectionCopyToast((current) => (current === selectionCopyToast ? null : current));
    }, 1200);
    return () => {
      clearTimeout(timeout);
    };
  }, [selectionCopyToast]);

  const showSelectionCopyToast = useCallback(() => {
    setSelectionCopyToast(SELECTION_COPY_TOAST_MESSAGE);
  }, []);

  const copyRendererSelection = useCallback(() => {
    const selectedText = terminalRenderer.getSelection?.()?.getSelectedText().trim();
    if (!selectedText) return false;
    void copyToClipboard(selectedText, "Copied to clipboard");
    terminalRenderer.clearSelection?.();
    showSelectionCopyToast();
    return true;
  }, [copyToClipboard, showSelectionCopyToast, terminalRenderer]);

  useEffect(() => {
    const terminalConsole = terminalRenderer.console;
    if (!terminalConsole) return;
    const previousHandler = terminalConsole.onCopySelection;
    terminalConsole.onCopySelection = (value: string) => {
      if (!value.trim()) return;
      void copyToClipboard(value, "Copied to clipboard");
      terminalRenderer.clearSelection?.();
      showSelectionCopyToast();
    };
    return () => {
      terminalConsole.onCopySelection = previousHandler;
    };
  }, [copyToClipboard, showSelectionCopyToast, terminalRenderer]);

  useEffect(() => {
    if (imagePreview?.status !== "ready" || !imagePreview.filePath) {
      clearTerminalImagePreview(terminalRenderer);
      return;
    }
    if (!terminalImageSupport.supported || terminalImageSupport.mode !== "kitty") {
      return;
    }
    const previewFilePath = imagePreview.filePath;
    const timer = setTimeout(() => {
      clearTerminalImagePreview(terminalRenderer);
      renderKittyImagePreview(terminalRenderer, {
        filePath: previewFilePath,
        top: imagePreviewModalTop + 3,
        left: imagePreviewModalLeft + 3,
        width: imagePreviewCanvasWidth,
        height: imagePreviewCanvasHeight,
        cellPixelWidth: imagePreviewCellPixelWidth,
        cellPixelHeight: imagePreviewCellPixelHeight,
      });
    }, 0);
    return () => {
      clearTimeout(timer);
      clearTerminalImagePreview(terminalRenderer);
    };
  }, [
    terminalRenderer,
    imagePreview,
    imagePreviewCanvasHeight,
    imagePreviewCanvasWidth,
    imagePreviewCellPixelHeight,
    imagePreviewCellPixelWidth,
    imagePreviewModalLeft,
    imagePreviewModalTop,
    terminalImageSupport,
  ]);

  const sidebarBg = PALETTE.sidebar;
  return (
    <box
      onMouseDown={() => {
        if (overlayMenu !== null) {
          closeOverlayMenu();
        }
        if (sidebarContextMenu) {
          closeSidebarContextMenu();
        }
        if (showSidebarOverlay) {
          setSidebarOverlayOpen(false);
        }
      }}
      onMouseUp={() => {
        copyRendererSelection();
      }}
      style={{
        position: "relative",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        backgroundColor: PALETTE.canvas,
      }}
    >
      {showSidebarOverlay ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: viewportColumns,
            height: viewportRows,
            backgroundColor: PALETTE.scrim,
            zIndex: 120,
          }}
          onMouseDown={() => {
            setSidebarOverlayOpen(false);
          }}
        />
      ) : null}

      {responsiveLayout.showSidebar || showSidebarOverlay ? (
        <box
          onMouseDown={(event) => {
            if (showSidebarOverlay) {
              event.preventDefault();
              event.stopPropagation?.();
            }
          }}
          style={{
            width: responsiveLayout.showSidebar ? responsiveLayout.sidebarWidth : TUI_SIDEBAR_WIDTH,
            backgroundColor: sidebarBg,
            border: ["right"],
            borderColor: PALETTE.divider,
            flexDirection: "column",
            ...(showSidebarOverlay
              ? {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  zIndex: 130,
                }
              : {}),
          }}
        >
          <box
            style={{
              height: 3,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <box style={{ flexDirection: "row", alignItems: "center" }}>
              {responsiveLayout.showWindowDots ? <WindowDots /> : null}
              <text
                content={responsiveLayout.sidebarTitle}
                style={{
                  fg: PALETTE.text,
                }}
              />
              {responsiveLayout.showSidebarAlphaBadge ? <Badge label="ALPHA" /> : null}
            </box>
          </box>

          <scrollbox
            focused={focusArea === "projects" || focusArea === "threads"}
            style={{
              flexGrow: 1,
              ...themedScrollboxStyle(sidebarBg),
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <SectionLabel
              label="PROJECTS"
              actions={[
                {
                  icon: "⇅",
                  active: overlayMenu === "sidebar-sort",
                  onPress: (event) => {
                    toggleSidebarSortMenu(event);
                  },
                },
                {
                  icon: "+",
                  onPress: () => {
                    openProjectPathPrompt();
                  },
                },
              ]}
            />

            {projects.length === 0 ? (
              <box
                style={{
                  paddingLeft: 2,
                  paddingRight: 2,
                  paddingTop: 1,
                  paddingBottom: 1,
                }}
              >
                <text
                  content="Add a workspace path to start. The current folder is prefilled."
                  style={{ fg: PALETTE.muted }}
                />
              </box>
            ) : null}

            {sortedProjects.map((project) => {
              const projectThreads = threadsByProject.get(project.id) ?? [];
              const orderedProjectThreadIds = projectThreads.map((thread) => thread.id);
              const isProjectExpanded = expandedProjectIds.has(project.id);
              const isProjectActive = project.id === activeProjectId;
              const projectStatus = resolveProjectStatusIndicator(
                projectThreads.map((thread) =>
                  resolveThreadStatusPillForTui(thread, {
                    forceUnread: locallyUnreadThreadIds.has(thread.id),
                    locallyVisitedAt: locallyVisitedThreads[thread.id],
                  }),
                ),
              );

              return (
                <box
                  key={project.id}
                  style={{
                    flexDirection: "column",
                  }}
                >
                  <SidebarRow
                    active={isProjectActive}
                    compact
                    onPress={() => {
                      closeSidebarContextMenu();
                      if (selectedThreadIds.size > 0) {
                        clearSelection();
                      }
                      selectProject(project.id);
                      setExpandedProjectIds((current) =>
                        resolveProjectExpansionOnRowPress({
                          expandedProjectIds: current,
                          projectId: project.id,
                          isProjectActive,
                        }),
                      );
                    }}
                    onSecondaryPress={(event) => {
                      openProjectContextMenu(project.id, event);
                    }}
                  >
                    <text
                      content={
                        !isProjectExpanded && projectStatus ? "●" : isProjectExpanded ? "▾" : "▸"
                      }
                      style={{
                        fg:
                          !isProjectExpanded && projectStatus
                            ? resolveThreadStatusDotColor(
                                {
                                  label: projectStatus.label,
                                  dotColor: resolveThreadStatusColor(projectStatus.label),
                                  pulse: projectStatus.pulse,
                                },
                                sidebarPulseTick,
                              )
                            : PALETTE.subtle,
                        marginRight: 1,
                      }}
                    />
                    <text content="󰉋" style={{ fg: PALETTE.muted, marginRight: 1 }} />
                    <text
                      content={project.title}
                      style={{
                        fg: isProjectActive ? PALETTE.text : PALETTE.muted,
                        flexGrow: 1,
                      }}
                    />
                    <IconButton
                      icon="+"
                      width={3}
                      onPress={() => {
                        closeSidebarContextMenu();
                        if (selectedThreadIds.size > 0) {
                          clearSelection();
                        }
                        selectProject(project.id);
                        openDraftThread(project.id);
                      }}
                    />
                  </SidebarRow>

                  {isProjectExpanded ? (
                    <box
                      style={{
                        marginLeft: 1,
                        flexDirection: "column",
                      }}
                    >
                      {projectThreads.length > 0 || draftThreadsByProjectId[project.id] ? (
                        <>
                          {draftThreadsByProjectId[project.id] ? (
                            <SidebarRow
                              key={draftThreadsByProjectId[project.id]!.id}
                              active={draftThreadsByProjectId[project.id]!.id === activeThreadId}
                              selected={selectedThreadIds.has(
                                draftThreadsByProjectId[project.id]!.id,
                              )}
                              activeBackgroundColor={PALETTE.controlActiveStrong}
                              compact
                              onPress={() => {
                                closeSidebarContextMenu();
                                if (selectedThreadIds.size > 0) {
                                  clearSelection();
                                }
                                selectProject(project.id);
                                setSelectedThreadId(draftThreadsByProjectId[project.id]!.id);
                                setMainView("thread");
                                setFocusArea("composer");
                                setTimeout(() => {
                                  composerRef.current?.focus();
                                }, 0);
                              }}
                            >
                              <box
                                style={{
                                  width: 1,
                                  marginRight: 1,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              />
                              <box
                                style={{
                                  width: SIDEBAR_THREAD_TITLE_WIDTH,
                                  flexShrink: 0,
                                  overflow: "hidden",
                                  height: 1,
                                }}
                              >
                                <text
                                  content={truncateTitleForDisplay(
                                    DEFAULT_THREAD_TITLE,
                                    SIDEBAR_THREAD_TITLE_WIDTH,
                                  )}
                                  style={{
                                    fg:
                                      draftThreadsByProjectId[project.id]!.id === activeThreadId ||
                                      selectedThreadIds.has(draftThreadsByProjectId[project.id]!.id)
                                        ? PALETTE.text
                                        : PALETTE.muted,
                                  }}
                                />
                              </box>
                              <box
                                style={{
                                  width: SIDEBAR_THREAD_TIMESTAMP_WIDTH,
                                  marginLeft: SIDEBAR_THREAD_TIMESTAMP_GAP,
                                  flexShrink: 0,
                                  justifyContent: "flex-end",
                                }}
                              />
                            </SidebarRow>
                          ) : null}
                          {projectThreads.map((thread) => {
                            const status = threadStatus(thread, {
                              forceUnread: locallyUnreadThreadIds.has(thread.id),
                              locallyVisitedAt: locallyVisitedThreads[thread.id],
                            });
                            const isActive = thread.id === activeThreadId;
                            const isSelected = selectedThreadIds.has(thread.id);
                            return (
                              <SidebarRow
                                key={thread.id}
                                active={isActive}
                                selected={isSelected}
                                activeBackgroundColor={PALETTE.controlActiveStrong}
                                compact
                                onPress={(event) => {
                                  closeSidebarContextMenu();
                                  handleThreadClick(
                                    event,
                                    project.id,
                                    thread.id,
                                    orderedProjectThreadIds,
                                  );
                                }}
                                onSecondaryPress={(event) => {
                                  openThreadContextMenu(project.id, thread.id, event);
                                }}
                              >
                                <box
                                  style={{
                                    width: 1,
                                    marginRight: 1,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {status ? (
                                    <text
                                      content="●"
                                      style={{
                                        fg: resolveThreadStatusDotColor(status, sidebarPulseTick),
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : null}
                                </box>
                                <box
                                  style={{
                                    width: SIDEBAR_THREAD_TITLE_WIDTH,
                                    flexShrink: 0,
                                    overflow: "hidden",
                                    height: 1,
                                  }}
                                >
                                  <text
                                    content={truncateTitleForDisplay(
                                      thread.title,
                                      SIDEBAR_THREAD_TITLE_WIDTH,
                                    )}
                                    style={{
                                      fg: isActive || isSelected ? PALETTE.text : PALETTE.muted,
                                    }}
                                  />
                                </box>
                                <box
                                  style={{
                                    width: SIDEBAR_THREAD_TIMESTAMP_WIDTH,
                                    marginLeft: SIDEBAR_THREAD_TIMESTAMP_GAP,
                                    flexShrink: 0,
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  <text
                                    content={formatRelativeTime(thread.updatedAt)}
                                    style={{
                                      fg: isActive || isSelected ? PALETTE.muted : PALETTE.subtle,
                                      flexShrink: 0,
                                    }}
                                  />
                                </box>
                              </SidebarRow>
                            );
                          })}
                        </>
                      ) : (
                        <box
                          style={{
                            paddingLeft: 2,
                            paddingRight: 1,
                            paddingTop: 0,
                            paddingBottom: 0,
                          }}
                        >
                          <text content="No threads yet" style={{ fg: PALETTE.subtle }} />
                        </box>
                      )}
                    </box>
                  ) : null}
                </box>
              );
            })}
          </scrollbox>

          <box
            style={{
              paddingLeft: 1,
              paddingRight: 1,
              paddingTop: 1,
              paddingBottom: 1,
            }}
          >
            <SidebarRow
              suppressHighlight
              onPress={() => {
                if (mainView === "settings") {
                  returnToThreadView();
                  return;
                }
                openMainView("settings");
              }}
            >
              <text
                content="󰒓"
                style={{
                  fg: mainView === "settings" ? PALETTE.text : PALETTE.muted,
                  marginRight: 1,
                }}
              />
              <text
                content="Settings"
                style={{
                  fg: mainView === "settings" ? PALETTE.text : PALETTE.muted,
                }}
              />
            </SidebarRow>
            <SidebarRow
              suppressHighlight
              onPress={() => {
                if (mainView === "keybindings") {
                  returnToThreadView();
                  return;
                }
                openMainView("keybindings");
              }}
            >
              <text
                content="󰌌"
                style={{
                  fg: mainView === "keybindings" ? PALETTE.text : PALETTE.muted,
                  marginRight: 1,
                }}
              />
              <text
                content="Keybindings"
                style={{
                  fg: mainView === "keybindings" ? PALETTE.text : PALETTE.muted,
                }}
              />
            </SidebarRow>
          </box>
        </box>
      ) : null}

      <box
        style={{
          flexDirection: "column",
          flexGrow: 1,
          backgroundColor: PALETTE.main,
        }}
      >
        <box
          style={{
            height: 3,
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: responsiveLayout.showSidebarToggle ? 1 : 2,
            paddingRight: 0,
            paddingTop: 1,
            paddingBottom: 1,
            backgroundColor: PALETTE.main,
            border: ["bottom"],
            borderColor: PALETTE.divider,
          }}
        >
          <box
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexGrow: 1,
              flexShrink: 1,
              overflow: "hidden",
              height: 1,
            }}
          >
            {responsiveLayout.showSidebarToggle ? (
              <ToolbarButton
                icon={responsiveLayout.showSidebar ? "✕" : "☰"}
                compact
                marginRight={1}
                onPress={() => toggleSidebarVisibility()}
              />
            ) : null}
            <box
              style={{
                flexGrow: 1,
                flexShrink: 1,
                overflow: "hidden",
                height: 1,
              }}
            >
              <text content={activeThreadDisplayTitle} style={{ fg: PALETTE.text }} />
            </box>
            {mainView === "thread" && activeProject && responsiveLayout.showHeaderProjectBadge ? (
              <Badge label={activeProject.title} />
            ) : null}
          </box>

          <box
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              marginLeft: 2,
              paddingRight: 1,
            }}
          >
            {mainView === "settings" ? (
              <ToolbarButton
                icon="↺"
                active={changedSettingLabels.length > 0}
                disabled={changedSettingLabels.length === 0}
                compact
                marginRight={1}
                onPress={() => restoreDefaultSettings()}
              />
            ) : mainView === "keybindings" ? null : (
              <>
                <ToolbarButton
                  icon={gitActionBusy ? "󱦟" : "󰊢"}
                  active={overlayMenu === "git-actions"}
                  disabled={!gitCwd || !isGitRepo}
                  chrome="bare"
                  width={4}
                  justifyContent="flex-end"
                  iconColor={
                    gitActionBusy
                      ? PALETTE.text
                      : gitStatusForActions?.hasWorkingTreeChanges
                        ? PALETTE.success
                        : PALETTE.muted
                  }
                  onPress={toggleGitActionsMenu}
                />
                <ToolbarButton
                  icon=""
                  active={diffOpen}
                  disabled={!isGitRepo}
                  chrome="bare"
                  width={4}
                  justifyContent="flex-start"
                  iconColor={PALETTE.muted}
                  onPress={toggleDiffView}
                />
              </>
            )}
          </box>
        </box>

        <box style={{ flexDirection: "row", flexGrow: 1 }}>
          <box
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexDirection: "column",
              position: "relative",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
              minHeight: 0,
            }}
          >
            {mainView === "thread" && selectionCopyToast ? (
              <SelectionCopyToast message={selectionCopyToast} />
            ) : null}

            {mainView !== "thread" ? (
              <scrollbox
                focused={focusArea === "settings"}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minHeight: 0,
                  ...themedScrollboxStyle(PALETTE.main),
                  paddingRight: 1,
                }}
              >
                <box
                  style={{
                    maxWidth: 104,
                    width: "100%",
                    flexDirection: "column",
                  }}
                >
                  {mainView === "settings" ? (
                    <>
                      <SettingsSection title="General">
                        <SettingsRow
                          title="Theme"
                          description="Choose how T3 Code looks across the app."
                          resetAction={
                            appSettings.theme !== DEFAULT_APP_THEME ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    theme: DEFAULT_APP_THEME,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <ToolbarButton
                              label={`${selectedThemeLabel} ▾`}
                              surface="inset"
                              active={
                                overlayMenu === "settings-select" && settingsSelectKind === "theme"
                              }
                              onPress={(event) => openSettingsSelectMenu("theme", event)}
                            />
                          }
                        />
                        <SettingsRow
                          title="Time format"
                          description="System default follows your browser or OS clock preference."
                          resetAction={
                            appSettings.timestampFormat !== DEFAULT_TIMESTAMP_FORMAT ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <ToolbarButton
                              label={`${TIMESTAMP_FORMAT_LABELS[appSettings.timestampFormat]} ▾`}
                              surface="inset"
                              active={
                                overlayMenu === "settings-select" &&
                                settingsSelectKind === "timestamp-format"
                              }
                              onPress={(event) => openSettingsSelectMenu("timestamp-format", event)}
                            />
                          }
                        />
                        <SettingsRow
                          title="Assistant output"
                          description="Show token-by-token output while a response is in progress."
                          status={appSettings.enableAssistantStreaming ? "Streaming" : "Buffered"}
                          resetAction={
                            appSettings.enableAssistantStreaming !==
                            DEFAULT_APP_SETTINGS.enableAssistantStreaming ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    enableAssistantStreaming:
                                      DEFAULT_APP_SETTINGS.enableAssistantStreaming,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <TogglePill
                              checked={appSettings.enableAssistantStreaming}
                              onPress={() =>
                                updateAppSettings({
                                  enableAssistantStreaming: !appSettings.enableAssistantStreaming,
                                })
                              }
                            />
                          }
                        />
                        <SettingsRow
                          title="New threads"
                          description="Pick the default workspace mode for newly created draft threads."
                          resetAction={
                            appSettings.defaultThreadEnvMode !==
                            DEFAULT_APP_SETTINGS.defaultThreadEnvMode ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    defaultThreadEnvMode: DEFAULT_APP_SETTINGS.defaultThreadEnvMode,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <ToolbarButton
                              label={`${selectedThreadEnvLabel} ▾`}
                              surface="inset"
                              active={
                                overlayMenu === "settings-select" &&
                                settingsSelectKind === "thread-env"
                              }
                              onPress={(event) => openSettingsSelectMenu("thread-env", event)}
                            />
                          }
                        />
                        <SettingsRow
                          title="Delete confirmation"
                          description="Ask before deleting a thread and its chat history."
                          status={appSettings.confirmThreadDelete ? "Enabled" : "Disabled"}
                          resetAction={
                            appSettings.confirmThreadDelete !==
                            DEFAULT_APP_SETTINGS.confirmThreadDelete ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    confirmThreadDelete: DEFAULT_APP_SETTINGS.confirmThreadDelete,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <TogglePill
                              checked={appSettings.confirmThreadDelete}
                              onPress={() =>
                                updateAppSettings({
                                  confirmThreadDelete: !appSettings.confirmThreadDelete,
                                })
                              }
                            />
                          }
                        />
                      </SettingsSection>

                      <SettingsSection title="Models">
                        <SettingsRow
                          title="Text generation model"
                          description="Used for generated commit messages, PR titles, and branch names."
                          resetAction={
                            isGitTextGenerationModelDirty ? (
                              <SettingResetButton
                                onPress={() =>
                                  updateAppSettings({
                                    textGenerationModel: DEFAULT_APP_SETTINGS.textGenerationModel,
                                  })
                                }
                              />
                            ) : null
                          }
                          control={
                            <ToolbarButton
                              label={`${selectedGitTextGenerationModelLabel} ▾`}
                              surface="inset"
                              active={
                                overlayMenu === "settings-select" &&
                                settingsSelectKind === "git-model"
                              }
                              onPress={(event) => openSettingsSelectMenu("git-model", event)}
                            />
                          }
                        />
                        <SettingsRow
                          title="Custom models"
                          description="Add custom model slugs for supported providers."
                          status={
                            totalCustomModels > 0
                              ? `${totalCustomModels} saved model slug(s)`
                              : null
                          }
                          resetAction={
                            totalCustomModels > 0 ? (
                              <SettingResetButton
                                onPress={() => {
                                  updateAppSettings({
                                    customCodexModels: DEFAULT_APP_SETTINGS.customCodexModels,
                                    customClaudeModels: DEFAULT_APP_SETTINGS.customClaudeModels,
                                  });
                                  setCustomModelErrorByProvider({});
                                  setShowAllCustomModels(false);
                                }}
                              />
                            ) : null
                          }
                        >
                          <box
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 1,
                            }}
                          >
                            <ToolbarButton
                              label={`${selectedCustomModelProviderLabel} ▾`}
                              surface="inset"
                              active={
                                overlayMenu === "settings-select" &&
                                settingsSelectKind === "custom-model-provider"
                              }
                              onPress={(event) =>
                                openSettingsSelectMenu("custom-model-provider", event)
                              }
                            />
                          </box>
                          <box
                            style={{
                              backgroundColor: PALETTE.input,
                              paddingLeft: 1,
                              paddingRight: 1,
                              height: 3,
                              justifyContent: "center",
                              marginBottom: 1,
                            }}
                          >
                            <input
                              value={customModelInputByProvider[selectedCustomModelProvider]}
                              onInput={(value) => {
                                setCustomModelInputByProvider((current) => ({
                                  ...current,
                                  [selectedCustomModelProvider]: value,
                                }));
                                setCustomModelErrorByProvider((current) => ({
                                  ...current,
                                  [selectedCustomModelProvider]: null,
                                }));
                              }}
                              onKeyDown={(key) => {
                                if (
                                  key.name === "return" ||
                                  key.name === "enter" ||
                                  key.name === "kpenter" ||
                                  key.name === "linefeed"
                                ) {
                                  key.preventDefault();
                                  addCustomModel(selectedCustomModelProvider);
                                }
                              }}
                              placeholder={
                                MODEL_PROVIDER_SETTINGS.find(
                                  (entry) => entry.provider === selectedCustomModelProvider,
                                )?.example || "custom/model-slug"
                              }
                              cursorColor={PALETTE.cursor}
                              style={{
                                backgroundColor: PALETTE.input,
                                focusedBackgroundColor: PALETTE.input,
                                textColor: PALETTE.text,
                                focusedTextColor: PALETTE.text,
                                placeholderColor: PALETTE.subtle,
                              }}
                            />
                          </box>
                          <box
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 1,
                            }}
                          >
                            <ToolbarButton
                              label="Add"
                              onPress={() => addCustomModel(selectedCustomModelProvider)}
                            />
                            {totalCustomModels > 0 ? (
                              <ToolbarButton
                                label="Reset"
                                onPress={() => {
                                  updateAppSettings({
                                    customCodexModels: DEFAULT_APP_SETTINGS.customCodexModels,
                                    customClaudeModels: DEFAULT_APP_SETTINGS.customClaudeModels,
                                  });
                                  setCustomModelErrorByProvider({});
                                  setShowAllCustomModels(false);
                                }}
                              />
                            ) : null}
                          </box>
                          {customModelErrorByProvider[selectedCustomModelProvider] ? (
                            <text
                              content={
                                customModelErrorByProvider[selectedCustomModelProvider] ?? ""
                              }
                              style={{ fg: PALETTE.warning, marginBottom: 1 }}
                            />
                          ) : null}
                          {visibleCustomModelRows.map((row) => (
                            <box
                              key={row.key}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: PALETTE.surfaceAlt,
                                paddingLeft: 1,
                                paddingRight: 1,
                                marginBottom: 1,
                              }}
                            >
                              <box
                                style={{
                                  flexDirection: "column",
                                  flexGrow: 1,
                                  flexShrink: 1,
                                }}
                              >
                                <text
                                  content={`${row.providerTitle} · ${row.slug}`}
                                  style={{ fg: PALETTE.text }}
                                />
                              </box>
                              <ToolbarButton
                                label="Remove"
                                onPress={() => removeCustomModel(row.provider, row.slug)}
                              />
                            </box>
                          ))}
                          {savedCustomModelRows.length > 5 ? (
                            <ToolbarButton
                              label={showAllCustomModels ? "Show less" : "Show more"}
                              onPress={() => setShowAllCustomModels((current) => !current)}
                            />
                          ) : null}
                        </SettingsRow>
                      </SettingsSection>

                      <SettingsSection title="Advanced">
                        <SettingsRow
                          title="Provider installs"
                          description="Override the CLI used for new sessions."
                          resetAction={
                            isInstallSettingsDirty ? (
                              <SettingResetButton
                                onPress={() => {
                                  updateAppSettings({
                                    claudeBinaryPath: DEFAULT_APP_SETTINGS.claudeBinaryPath,
                                    codexBinaryPath: DEFAULT_APP_SETTINGS.codexBinaryPath,
                                    codexHomePath: DEFAULT_APP_SETTINGS.codexHomePath,
                                  });
                                  setOpenInstallProviders({
                                    codex: false,
                                    claudeAgent: false,
                                  });
                                }}
                              />
                            ) : null
                          }
                        >
                          {INSTALL_PROVIDER_SETTINGS.map((providerSettings) => {
                            const isOpen = openInstallProviders[providerSettings.provider];
                            const binaryPathValue =
                              providerSettings.binaryPathKey === "claudeBinaryPath"
                                ? appSettings.claudeBinaryPath
                                : appSettings.codexBinaryPath;
                            return (
                              <box
                                key={providerSettings.provider}
                                style={{ flexDirection: "column" }}
                              >
                                <box
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    backgroundColor: PALETTE.surfaceAlt,
                                    paddingLeft: 1,
                                    paddingRight: 1,
                                    marginBottom: 1,
                                  }}
                                >
                                  <box
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      flexGrow: 1,
                                      flexShrink: 1,
                                    }}
                                  >
                                    <text
                                      content={providerSettings.title}
                                      style={{
                                        fg: PALETTE.text,
                                        marginRight: 1,
                                      }}
                                    />
                                    {(
                                      providerSettings.provider === "codex"
                                        ? appSettings.codexBinaryPath !==
                                            DEFAULT_APP_SETTINGS.codexBinaryPath ||
                                          appSettings.codexHomePath !==
                                            DEFAULT_APP_SETTINGS.codexHomePath
                                        : appSettings.claudeBinaryPath !==
                                          DEFAULT_APP_SETTINGS.claudeBinaryPath
                                    ) ? (
                                      <text content="Custom" style={{ fg: PALETTE.subtle }} />
                                    ) : null}
                                  </box>
                                  <ToolbarButton
                                    label={isOpen ? "Hide" : "Edit"}
                                    onPress={() =>
                                      setOpenInstallProviders((current) => ({
                                        ...current,
                                        [providerSettings.provider]:
                                          !current[providerSettings.provider],
                                      }))
                                    }
                                  />
                                </box>
                                {isOpen ? (
                                  <box
                                    style={{
                                      flexDirection: "column",
                                      marginBottom: 1,
                                      paddingLeft: 1,
                                      paddingRight: 1,
                                    }}
                                  >
                                    <text
                                      content={`${providerSettings.title} binary path`}
                                      style={{
                                        fg: PALETTE.text,
                                        marginBottom: 1,
                                      }}
                                    />
                                    <box
                                      style={{
                                        backgroundColor: PALETTE.input,
                                        paddingLeft: 1,
                                        paddingRight: 1,
                                        height: 3,
                                        justifyContent: "center",
                                        marginBottom: 1,
                                      }}
                                    >
                                      <input
                                        value={binaryPathValue}
                                        onInput={(value) =>
                                          updateAppSettings(
                                            providerSettings.binaryPathKey === "claudeBinaryPath"
                                              ? { claudeBinaryPath: value }
                                              : { codexBinaryPath: value },
                                          )
                                        }
                                        placeholder={providerSettings.binaryPlaceholder}
                                        cursorColor={PALETTE.cursor}
                                        style={{
                                          backgroundColor: PALETTE.input,
                                          focusedBackgroundColor: PALETTE.input,
                                          textColor: PALETTE.text,
                                          focusedTextColor: PALETTE.text,
                                          placeholderColor: PALETTE.subtle,
                                        }}
                                      />
                                    </box>
                                    <text
                                      content={providerSettings.binaryDescription}
                                      style={{
                                        fg: PALETTE.subtle,
                                        marginBottom: 1,
                                      }}
                                    />
                                    {providerSettings.homePathKey ? (
                                      <>
                                        <text
                                          content="CODEX_HOME path"
                                          style={{
                                            fg: PALETTE.text,
                                            marginBottom: 1,
                                          }}
                                        />
                                        <box
                                          style={{
                                            backgroundColor: PALETTE.input,
                                            paddingLeft: 1,
                                            paddingRight: 1,
                                            height: 3,
                                            justifyContent: "center",
                                            marginBottom: 1,
                                          }}
                                        >
                                          <input
                                            value={appSettings.codexHomePath}
                                            onInput={(value) =>
                                              updateAppSettings({
                                                codexHomePath: value,
                                              })
                                            }
                                            placeholder={
                                              providerSettings.homePlaceholder || "CODEX_HOME"
                                            }
                                            cursorColor={PALETTE.cursor}
                                            style={{
                                              backgroundColor: PALETTE.input,
                                              focusedBackgroundColor: PALETTE.input,
                                              textColor: PALETTE.text,
                                              focusedTextColor: PALETTE.text,
                                              placeholderColor: PALETTE.subtle,
                                            }}
                                          />
                                        </box>
                                        <text
                                          content={providerSettings.homeDescription ?? ""}
                                          style={{
                                            fg: PALETTE.subtle,
                                            marginBottom: 1,
                                          }}
                                        />
                                      </>
                                    ) : null}
                                  </box>
                                ) : null}
                              </box>
                            );
                          })}
                        </SettingsRow>
                        <SettingsRow
                          title="Keybindings"
                          description="Open the persisted keybindings.json file to edit advanced bindings directly."
                          status={
                            <>
                              <text
                                content={
                                  serverConfig?.keybindingsConfigPath ??
                                  "Resolving keybindings path..."
                                }
                                style={{ fg: PALETTE.text }}
                              />
                              {openKeybindingsError ? (
                                <text
                                  content={openKeybindingsError}
                                  style={{ fg: PALETTE.warning }}
                                />
                              ) : (
                                <text
                                  content="Opens in your preferred editor."
                                  style={{ fg: PALETTE.subtle }}
                                />
                              )}
                            </>
                          }
                          control={
                            <box style={{ flexDirection: "row" }}>
                              <ToolbarButton
                                label="View page"
                                onPress={() => openMainView("keybindings")}
                              />
                              <ToolbarButton
                                label={isOpeningKeybindings ? "Opening..." : "Open file"}
                                disabled={
                                  !serverConfig?.keybindingsConfigPath || isOpeningKeybindings
                                }
                                onPress={() => {
                                  void openKeybindingsFile();
                                }}
                              />
                            </box>
                          }
                        />
                        <SettingsRow
                          title="Version"
                          description="Current application version."
                          control={<text content={APP_VERSION} style={{ fg: PALETTE.muted }} />}
                        />
                      </SettingsSection>
                    </>
                  ) : (
                    <>
                      <box
                        style={{
                          backgroundColor: PALETTE.surfaceAlt,
                          paddingLeft: 1,
                          paddingRight: 1,
                          paddingTop: 1,
                          paddingBottom: 1,
                          marginBottom: 2,
                          flexDirection: "column",
                        }}
                      >
                        <text
                          content="Reference for the keyboard and mouse controls available in the TUI today."
                          style={{ fg: PALETTE.text }}
                        />
                        <text
                          content="This page is intentionally limited to TUI behavior."
                          style={{ fg: PALETTE.subtle }}
                        />
                      </box>
                      {KEYBINDING_GUIDE_SECTIONS.map((section) => (
                        <SettingsSection key={section.title} title={section.title}>
                          {section.items.map((item) => (
                            <SettingsRow
                              key={`${section.title}:${item.shortcut}:${item.action}`}
                              title={item.action}
                              description={item.note ?? ""}
                              control={
                                <text content={item.shortcut} style={{ fg: PALETTE.muted }} />
                              }
                            />
                          ))}
                        </SettingsSection>
                      ))}
                    </>
                  )}
                </box>
              </scrollbox>
            ) : showFullDiffView ? (
              <scrollbox
                focused={focusArea === "diff"}
                onMouseDown={() => {
                  setFocusArea("diff");
                }}
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minHeight: 0,
                  ...themedScrollboxStyle(PALETTE.main),
                  paddingRight: 1,
                }}
              >
                <box style={{ flexDirection: "column", minHeight: 0 }}>
                  <box
                    style={{
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      marginBottom: diffFiles.length > 0 ? 1 : 0,
                    }}
                  >
                    <ToolbarButton
                      icon="󰦪"
                      label="Uni"
                      active={diffView === "unified"}
                      onPress={() => setDiffView("unified")}
                    />
                    <ToolbarButton
                      icon="󰹙"
                      label="Split"
                      active={diffView === "split"}
                      onPress={() => setDiffView("split")}
                    />
                  </box>

                  {diffFiles.length > 0 ? (
                    diffFiles.map((file) => {
                      const isCollapsed = collapsedDiffFileKeys.has(file.key);
                      const diffStat =
                        file.addedLines > 0 || file.removedLines > 0
                          ? `+${file.addedLines} -${file.removedLines}`
                          : "No line changes";

                      return (
                        <box
                          key={file.key}
                          style={{
                            flexDirection: "column",
                            marginBottom: 1,
                          }}
                        >
                          <box
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation?.();
                              setFocusArea("diff");
                              toggleDiffFile(file.key);
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              paddingLeft: 1,
                              paddingRight: 1,
                              height: 1,
                            }}
                          >
                            <box
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                flexGrow: 1,
                                flexShrink: 1,
                                minWidth: 0,
                                overflow: "hidden",
                              }}
                            >
                              <text
                                content={isCollapsed ? "▸" : "▾"}
                                style={{ fg: PALETTE.subtle, marginRight: 1 }}
                              />
                              <text
                                content={file.filePath}
                                truncate={true}
                                style={{ fg: PALETTE.text, flexGrow: 1 }}
                              />
                            </box>
                            <text content={diffStat} style={{ fg: PALETTE.subtle }} />
                          </box>

                          {isCollapsed ? null : (
                            <box
                              style={{
                                flexDirection: "column",
                                minHeight: 8,
                                maxHeight: 24,
                              }}
                            >
                              <diff
                                diff={file.patch}
                                syntaxStyle={DIFF_SYNTAX}
                                view={diffView}
                                showLineNumbers
                                wrapMode="none"
                                {...(file.filetype ? { filetype: file.filetype } : {})}
                                addedBg="#173124"
                                removedBg="#3a1f1f"
                                addedContentBg="#1d3a2b"
                                removedContentBg="#442525"
                                contextBg={PALETTE.main}
                                lineNumberBg={PALETTE.surface}
                                addedSignColor="#4ade80"
                                removedSignColor="#f87171"
                                style={{
                                  flexGrow: 1,
                                  minHeight: 8,
                                }}
                              />
                            </box>
                          )}
                        </box>
                      );
                    })
                  ) : (
                    <box
                      style={{
                        paddingLeft: 1,
                        paddingRight: 1,
                      }}
                    >
                      <text content="No diff yet" style={{ fg: PALETTE.subtle }} />
                    </box>
                  )}
                </box>
              </scrollbox>
            ) : (
              <>
                <scrollbox
                  ref={timelineScrollRef}
                  focused={focusArea === "timeline"}
                  stickyScroll
                  stickyStart="bottom"
                  onMouseDown={() => {
                    setFocusArea("timeline");
                    scheduleTimelineScrollStateSync();
                  }}
                  onMouseScroll={() => {
                    setFocusArea("timeline");
                    scheduleTimelineScrollStateSync();
                  }}
                  style={{
                    flexGrow: 1,
                    flexShrink: 1,
                    minHeight: 0,
                    ...themedScrollboxStyle(PALETTE.main),
                    paddingRight: 1,
                  }}
                >
                  {!activeProject && !activeThread && !activeDraftThread ? (
                    <box
                      style={{
                        backgroundColor: PALETTE.surface,
                        padding: 2,
                        marginBottom: 1,
                      }}
                    >
                      <text content="booting workspace" style={{ fg: PALETTE.muted }} />
                    </box>
                  ) : null}

                  {startupIssue ? (
                    <box
                      style={{
                        backgroundColor: PALETTE.surfaceWarn,
                        padding: 2,
                        marginBottom: 1,
                      }}
                    >
                      <text content={startupIssue} style={{ fg: PALETTE.text }} />
                    </box>
                  ) : null}

                  {approvals.map((approval) => (
                    <box
                      key={`approval-${approval.requestId}`}
                      style={{
                        backgroundColor: PALETTE.surfaceWarn,
                        marginBottom: 1,
                        padding: 1,
                      }}
                    >
                      <text content={approvalHint(approval)} style={{ fg: PALETTE.text }} />
                    </box>
                  ))}

                  {userInputs.map((input) => (
                    <box
                      key={`input-${input.requestId}`}
                      style={{
                        backgroundColor: PALETTE.surfaceInfo,
                        marginBottom: 1,
                        padding: 1,
                      }}
                    >
                      <text content={userInputHint(input)} style={{ fg: PALETTE.text }} />
                    </box>
                  ))}

                  {timelineEntries.map((entry, index) => {
                    const nextEntry =
                      index < timelineEntries.length - 1 ? timelineEntries[index + 1] : null;

                    if (entry.kind === "message") {
                      const timestamp = formatMessageTimestamp(
                        entry.createdAt,
                        appSettings.timestampFormat,
                      );
                      if (entry.message.role === "user") {
                        const userMessageContent = stripMentionTokensFromText(
                          renderMessageBody(entry),
                        );
                        return (
                          <box
                            key={entry.id}
                            style={{
                              width: "100%",
                              marginBottom: 1,
                              flexDirection: "column",
                              alignItems: "flex-end",
                            }}
                          >
                            <box
                              style={{
                                width: userMessageBubbleWidth,
                                flexDirection: "column",
                                flexShrink: 1,
                                alignItems: "flex-end",
                              }}
                            >
                              <box
                                style={{
                                  width: "auto",
                                  maxWidth: "100%",
                                  minWidth: 0,
                                  paddingTop: 0,
                                  paddingBottom: 0,
                                  paddingLeft: 1,
                                  paddingRight: 1,
                                  flexDirection: "column",
                                  flexShrink: 1,
                                  alignSelf: "flex-end",
                                }}
                              >
                                <MessageMentions
                                  mentions={userMessageContent.mentions}
                                  align="flex-end"
                                />
                                <MessageAttachments
                                  attachments={entry.message.attachments ?? []}
                                  align="flex-end"
                                  onOpen={openImagePreview}
                                />
                                {userMessageContent.body.trim().length > 0 ? (
                                  <MessageMarkdown
                                    content={userMessageContent.body}
                                    fillWidth={false}
                                    onCopyCodeBlock={(value) => {
                                      void copyToClipboard(value, "Code copied");
                                    }}
                                  />
                                ) : null}
                              </box>
                            </box>
                            <box
                              style={{
                                width: userMessageBubbleWidth,
                                minWidth: 0,
                                flexDirection: "row",
                                justifyContent: "flex-end",
                                flexShrink: 0,
                              }}
                            >
                              <text
                                content={timestamp}
                                style={{
                                  fg: PALETTE.subtle,
                                  marginTop: 0,
                                  flexShrink: 0,
                                }}
                              />
                            </box>
                          </box>
                        );
                      }

                      return (
                        <box
                          key={entry.id}
                          style={{
                            width: "100%",
                            marginTop: 0,
                            marginBottom: 1,
                            flexDirection: "column",
                          }}
                        >
                          <box
                            style={{
                              width: "100%",
                              minWidth: 0,
                              flexDirection: "column",
                            }}
                          >
                            <MessageMarkdown
                              content={renderMessageBody(entry)}
                              onCopyCodeBlock={(value) => {
                                void copyToClipboard(value, "Code copied");
                              }}
                            />
                          </box>
                          <box
                            style={{
                              width: "100%",
                              minWidth: 0,
                              flexDirection: "row",
                              flexShrink: 0,
                            }}
                          >
                            <text
                              content={timestamp}
                              style={{ fg: PALETTE.subtle, flexShrink: 0 }}
                            />
                          </box>
                        </box>
                      );
                    }

                    if (entry.kind === "proposed-plan") {
                      return (
                        <box
                          key={entry.id}
                          style={{
                            backgroundColor: PALETTE.surfacePlan,
                            marginBottom: 0,
                            paddingTop: 1,
                            paddingBottom: 1,
                            paddingLeft: 1,
                            paddingRight: 1,
                            flexDirection: "column",
                          }}
                        >
                          <text
                            content={`plan · ${formatRelativeTime(entry.createdAt)}`}
                            style={{ fg: PALETTE.success, marginBottom: 1 }}
                          />
                          <text content={renderMessageBody(entry)} style={{ fg: PALETTE.text }} />
                        </box>
                      );
                    }

                    return (
                      <box
                        key={entry.id}
                        style={{
                          backgroundColor: PALETTE.surface,
                          marginTop: 0,
                          marginBottom: nextEntry?.kind === "work" ? 0 : 1,
                          maxWidth: "88%",
                          paddingTop: 0,
                          paddingBottom: 0,
                          paddingLeft: 1,
                          paddingRight: 1,
                          height: 1,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <box
                          style={{
                            width: 3,
                            height: 1,
                            flexShrink: 0,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <text
                            content={workEntryPrefix(entry.entry)}
                            style={{ fg: workEntryAccent(entry.entry) }}
                          />
                        </box>
                        <box
                          style={{
                            flexGrow: 1,
                            flexShrink: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            height: 1,
                          }}
                        >
                          <text
                            content={renderMessageBody(entry)}
                            truncate={true}
                            style={{ fg: PALETTE.muted }}
                          />
                        </box>
                      </box>
                    );
                  })}

                  {activePendingSends.map((entry) =>
                    (() => {
                      const pendingBody = stripMentionTokensFromText(entry.text).body;
                      return (
                        <box
                          key={`pending-send-${entry.messageId}`}
                          style={{
                            width: "100%",
                            marginTop: 1,
                            marginBottom: 1,
                            flexDirection: "column",
                            alignItems: "flex-end",
                          }}
                        >
                          <box
                            style={{
                              width: userMessageBubbleWidth,
                              flexDirection: "column",
                              flexShrink: 1,
                              alignItems: "flex-end",
                            }}
                          >
                            <box
                              style={{
                                width: "auto",
                                maxWidth: "100%",
                                minWidth: 0,
                                paddingLeft: 1,
                                paddingRight: 1,
                                flexDirection: "column",
                                flexShrink: 1,
                                alignSelf: "flex-end",
                              }}
                            >
                              <MessageMentions mentions={entry.mentions} align="flex-end" />
                              <MessageAttachments
                                attachments={entry.attachments}
                                align="flex-end"
                                onOpen={openImagePreview}
                              />
                              {pendingBody.length > 0 ? (
                                <MessageMarkdown
                                  content={pendingBody}
                                  fillWidth={false}
                                  onCopyCodeBlock={(value) => {
                                    void copyToClipboard(value, "Code copied");
                                  }}
                                />
                              ) : null}
                            </box>
                            <box
                              style={{
                                width: "auto",
                                maxWidth: "88%",
                                flexDirection: "row",
                                alignItems: "center",
                              }}
                            ></box>
                          </box>
                        </box>
                      );
                    })(),
                  )}

                  {showAssistantTyping ? (
                    <box
                      key="assistant-typing"
                      style={{
                        width: "100%",
                        marginBottom: 1,
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <box
                        style={{
                          width: "auto",
                          maxWidth: "88%",
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        {renderAnimatedSendDots(sendAnimationTick).map((dot) => (
                          <text key={dot.key} content={dot.character} style={{ fg: dot.color }} />
                        ))}
                      </box>
                    </box>
                  ) : null}
                </scrollbox>

                {showPathSuggestions ? (
                  <box
                    style={{
                      position: "absolute",
                      left: 2,
                      right: mainView === "thread" && diffOpen ? 2 : 3,
                      bottom: Math.max(1, composerDrawerOffset - 1),
                      backgroundColor: PALETTE.surfaceAlt,
                      flexDirection: "column",
                      zIndex: 10,
                    }}
                  >
                    {pathSuggestionEntries.length > 0 ? (
                      pathSuggestionEntries.map((entry, index) => (
                        <PathSuggestionRow
                          key={`${entry.kind}:${entry.path}`}
                          entry={entry}
                          active={index === pathSuggestionIndex}
                          onHover={() => setPathSuggestionIndex(index)}
                          onPress={() => applyComposerPathMention(entry)}
                        />
                      ))
                    ) : (
                      <box
                        style={{
                          paddingLeft: 1,
                          paddingRight: 1,
                          height: 1,
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <text
                          content={
                            pathSuggestionsLoading ? "Searching files..." : "No matching files"
                          }
                          style={{ fg: PALETTE.subtle }}
                        />
                      </box>
                    )}
                  </box>
                ) : null}

                {showScrollToBottom ? (
                  <box
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      marginTop: -1,
                      marginBottom: 1,
                      flexShrink: 0,
                    }}
                  >
                    <box
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation?.();
                        scrollTimelineToBottom();
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: PALETTE.surfaceAlt,
                        paddingLeft: 1,
                        paddingRight: 1,
                        height: 1,
                      }}
                    >
                      <text content="󰁅" style={{ fg: PALETTE.muted, marginRight: 1 }} />
                      <text content="Scroll to bottom" style={{ fg: PALETTE.muted }} />
                    </box>
                  </box>
                ) : (
                  <box style={{ height: 1 }} />
                )}

                <box
                  onMouseDown={(event) => {
                    event.stopPropagation?.();
                    if (overlayMenu !== null) {
                      closeOverlayMenu();
                    }
                    if (imagePasteInFlight) {
                      return;
                    }
                    setFocusArea("composer");
                    setTimeout(() => {
                      composerRef.current?.focus();
                    }, 0);
                  }}
                  style={{
                    position: "relative",
                    zIndex: 20,
                    backgroundColor: PALETTE.composerPanel,
                    border: true,
                    borderStyle: "rounded",
                    borderColor:
                      focusArea === "composer"
                        ? PALETTE.composerBorder
                        : PALETTE.composerBorderMuted,
                    paddingTop: 1,
                    paddingBottom: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    flexDirection: "column",
                    flexShrink: 0,
                  }}
                >
                  {composerBanner ? (
                    <box
                      style={{
                        backgroundColor: composerBanner.bg,
                        paddingLeft: 1,
                        paddingRight: 1,
                        paddingTop: 0,
                        paddingBottom: 0,
                        marginBottom: 1,
                      }}
                    >
                      <text content={composerBanner.text} style={{ fg: PALETTE.text }} />
                    </box>
                  ) : null}

                  <box
                    style={{
                      marginBottom: 1,
                      height: activePendingProgress ? "auto" : composerTextareaHeight,
                      minHeight: composerTextareaHeight,
                      paddingLeft: 1,
                      paddingRight: 1,
                      flexDirection: "row",
                      alignItems: "flex-start",
                    }}
                  >
                    {!activePendingUserInput && composerAttachments.length > 0 ? (
                      <box
                        style={{
                          paddingRight: 1,
                          paddingTop: 0,
                          flexShrink: 0,
                          alignSelf: "flex-start",
                          flexDirection: "row",
                        }}
                      >
                        {composerAttachments.map((attachment, index) => (
                          <AttachmentPill
                            key={attachmentSignature(attachment)}
                            label="󰋩 Image"
                            toneIndex={index}
                            onPress={() => {
                              openImagePreview(attachment);
                            }}
                          />
                        ))}
                      </box>
                    ) : null}
                    {!activePendingUserInput && composerMentions.length > 0 ? (
                      <box
                        style={{
                          paddingRight: 1,
                          paddingTop: 0,
                          flexShrink: 0,
                          alignSelf: "flex-start",
                          flexDirection: "row",
                        }}
                      >
                        {composerMentions.map((mention, index) => (
                          <AttachmentPill
                            key={mentionSignature(mention)}
                            label={mentionLabel(mention)}
                            toneIndex={index}
                          />
                        ))}
                      </box>
                    ) : null}
                    <box
                      style={{
                        flexGrow: 1,
                        flexShrink: 1,
                        minWidth: 0,
                        height: activePendingProgress ? "auto" : "100%",
                      }}
                    >
                      {activePendingProgress?.activeQuestion ? (
                        <box style={{ flexDirection: "column", marginBottom: 1 }}>
                          <box
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              marginBottom: 1,
                            }}
                          >
                            <text
                              content={activePendingProgress.activeQuestion.header}
                              style={{ fg: PALETTE.info, marginRight: 1 }}
                            />
                            {activePendingUserInput &&
                            activePendingUserInput.questions.length > 1 ? (
                              <text
                                content={`${activePendingProgress.questionIndex + 1}/${activePendingUserInput.questions.length}`}
                                style={{ fg: PALETTE.subtle }}
                              />
                            ) : null}
                          </box>
                          <text
                            content={activePendingProgress.activeQuestion.question}
                            style={{ fg: PALETTE.text, marginBottom: 1 }}
                          />
                          <box style={{ flexDirection: "column" }}>
                            {activePendingProgress.activeQuestion.options.map((option, index) => (
                              <PendingInputOptionRow
                                key={`${activePendingProgress.activeQuestion?.id}:${option.label}`}
                                label={option.label}
                                {...(option.description !== option.label
                                  ? { description: option.description }
                                  : {})}
                                {...(index < 9 ? { shortcutLabel: `${index + 1}.` } : {})}
                                selected={
                                  activePendingProgress.selectedOptionLabel === option.label &&
                                  !activePendingProgress.usingCustomAnswer
                                }
                                disabled={activePendingIsResponding}
                                onPress={() =>
                                  selectActivePendingUserInputOption(
                                    activePendingProgress.activeQuestion!.id,
                                    option.label,
                                  )
                                }
                              />
                            ))}
                          </box>
                        </box>
                      ) : null}
                      <textarea
                        key={composerResetKey}
                        ref={composerRef}
                        focused={composerIsFocused}
                        initialValue={composer}
                        onKeyDown={(key) => {
                          if (imagePasteInFlight || activePendingApproval) {
                            key.preventDefault();
                            return;
                          }
                          syncComposerValueRefSoon();
                          const composerValue = readComposerValue();
                          const composerSelection = composerRef.current?.getSelectedText() ?? "";
                          if (
                            isCtrlShiftA({
                              keyName: key.name,
                              ctrl: key.ctrl,
                              shift: key.shift,
                            })
                          ) {
                            key.preventDefault();
                            composerRef.current?.focus();
                            composerRef.current?.selectAll();
                            setComposerSelectionPaintTick((current) => current + 1);
                            return;
                          }
                          if (
                            shouldInterruptComposerOnEscape({
                              keyName: key.name,
                              hasDismissibleLayer: false,
                              showStopAction: activeThreadIsRunning,
                            })
                          ) {
                            key.preventDefault();
                            void interruptActiveTurn();
                            return;
                          }
                          if (
                            shouldCopyComposerSelectionOnCtrlShiftC({
                              keyName: key.name,
                              ctrl: key.ctrl,
                              shift: key.shift,
                              composerFocused: true,
                              hasSelection:
                                composerSelection.length > 0 || composerValue.length > 0,
                            })
                          ) {
                            key.preventDefault();
                            void copyToClipboard(
                              composerSelection.length > 0 ? composerSelection : composerValue,
                              "Copied to clipboard",
                            );
                            return;
                          }
                          if (
                            shouldClearComposerOnCtrlC({
                              keyName: key.name,
                              ctrl: key.ctrl,
                              shift: key.shift,
                              composerFocused: true,
                              hasComposerText: composerValue.length > 0,
                            })
                          ) {
                            key.preventDefault();
                            clearComposerDraft();
                            return;
                          }
                          if (
                            isCtrlC({
                              keyName: key.name,
                              ctrl: key.ctrl,
                            }) &&
                            key.shift !== true
                          ) {
                            key.preventDefault();
                            requestAppExit();
                            return;
                          }
                          if (
                            !activePendingUserInput &&
                            (composerAttachments.length > 0 || composerMentions.length > 0) &&
                            (key.name === "backspace" || key.name === "delete") &&
                            composerValue.length === 0
                          ) {
                            key.preventDefault();
                            if (composerAttachmentDeleteArmed) {
                              if (composerMentions.length > 0) {
                                removeLastComposerMention();
                              } else {
                                removeLastComposerAttachment();
                              }
                            } else {
                              setComposerAttachmentDeleteArmed(true);
                              setStatus(
                                composerMentions.length > 0
                                  ? "Press delete again to remove the last tagged file"
                                  : "Press delete again to remove the last image",
                              );
                            }
                            return;
                          }
                          if (composerAttachmentDeleteArmed) {
                            setComposerAttachmentDeleteArmed(false);
                          }
                          logger.log("composer.key", {
                            name: key.name,
                            shift: key.shift,
                            ctrl: key.ctrl,
                            meta: key.meta,
                            source: key.source,
                            sequence: key.sequence,
                          });
                          if (
                            !activePendingUserInput &&
                            key.ctrl &&
                            !key.meta &&
                            !key.shift &&
                            key.name === "y"
                          ) {
                            key.preventDefault();
                            void attachClipboardImage();
                            return;
                          }
                          if (
                            !activePendingUserInput &&
                            key.ctrl &&
                            !key.meta &&
                            !key.shift &&
                            (key.name === "j" || key.name === "linefeed") &&
                            !(showPathSuggestions && pathSuggestionEntries.length > 0)
                          ) {
                            key.preventDefault();
                            insertComposerText("\n");
                            return;
                          }
                          if (showPathSuggestions && pathSuggestionEntries.length > 0) {
                            if (key.name === "up" || (key.ctrl && key.name === "k")) {
                              key.preventDefault();
                              setPathSuggestionIndex((current) => Math.max(0, current - 1));
                              return;
                            }
                            if (key.name === "down" || (key.ctrl && key.name === "j")) {
                              key.preventDefault();
                              setPathSuggestionIndex((current) =>
                                Math.min(pathSuggestionEntries.length - 1, current + 1),
                              );
                              return;
                            }
                            if (
                              key.name === "return" ||
                              key.name === "enter" ||
                              key.name === "kpenter" ||
                              key.name === "linefeed"
                            ) {
                              const selected =
                                pathSuggestionEntries[pathSuggestionIndex] ??
                                pathSuggestionEntries[0];
                              if (selected) {
                                key.preventDefault();
                                applyComposerPathMention(selected);
                                return;
                              }
                            }
                          }
                          if (
                            key.name === "return" ||
                            key.name === "enter" ||
                            key.name === "kpenter" ||
                            key.name === "linefeed"
                          ) {
                            if (!key.shift) {
                              key.preventDefault();
                              if (composerPrimaryAction === "send") {
                                void sendPrompt();
                              } else {
                                void interruptActiveTurn();
                              }
                            } else {
                              syncComposerFromTextarea();
                            }
                            return;
                          }
                          syncComposerFromTextarea();
                        }}
                        onPaste={(event) => {
                          syncComposerValueRefSoon();
                          void handleComposerPaste(event);
                        }}
                        onSubmit={() => {
                          if (imagePasteInFlight || activePendingApproval) {
                            return;
                          }
                          if (composerPrimaryAction === "send") {
                            void sendPrompt();
                          } else {
                            void interruptActiveTurn();
                          }
                        }}
                        keyBindings={[
                          { name: "a", ctrl: true, shift: true, action: "select-all" },
                          { name: "return", action: "submit" },
                          { name: "enter", action: "submit" },
                          { name: "kpenter", action: "submit" },
                          { name: "linefeed", action: "submit" },
                          { name: "return", shift: true, action: "newline" },
                          { name: "enter", shift: true, action: "newline" },
                          { name: "kpenter", shift: true, action: "newline" },
                          { name: "linefeed", shift: true, action: "newline" },
                        ]}
                        placeholder={composerPlaceholder}
                        cursorColor={PALETTE.cursor}
                        style={{
                          backgroundColor: PALETTE.composerPanel,
                          focusedBackgroundColor: PALETTE.composerPanel,
                          textColor: PALETTE.text,
                          focusedTextColor: PALETTE.text,
                          placeholderColor: PALETTE.subtle,
                          height: activePendingProgress ? COMPOSER_TEXTAREA_MIN_HEIGHT : "100%",
                          width: "100%",
                        }}
                      />
                    </box>
                  </box>

                  <box
                    style={{
                      paddingLeft: 1,
                      paddingRight: 1,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    {activePendingApproval ? (
                      <>
                        <box style={{ flexGrow: 1 }} />
                        <ToolbarButton
                          label="Cancel"
                          disabled={respondingRequestIds.includes(activePendingApproval.requestId)}
                          onPress={() => {
                            void respondToApproval("cancel");
                          }}
                        />
                        <ToolbarButton
                          label="Decline"
                          disabled={respondingRequestIds.includes(activePendingApproval.requestId)}
                          onPress={() => {
                            void respondToApproval("decline");
                          }}
                        />
                        <ToolbarButton
                          label="Always allow"
                          disabled={respondingRequestIds.includes(activePendingApproval.requestId)}
                          onPress={() => {
                            void respondToApproval("acceptForSession");
                          }}
                        />
                        <ComposerSendButton
                          icon="↑"
                          label="Approve once"
                          disabled={respondingRequestIds.includes(activePendingApproval.requestId)}
                          onPress={() => {
                            void respondToApproval("accept");
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <box
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexGrow: 1,
                            flexShrink: 1,
                            overflow: "hidden",
                            height: 1,
                          }}
                        >
                          <ToolbarButton
                            icon={providerIcon(draftProvider)}
                            iconColor={providerColor(draftProvider)}
                            label={
                              responsiveLayout.showComposerModelLabel
                                ? modelControlLabel(draftProvider, draftModel)
                                : undefined
                            }
                            compact={!responsiveLayout.showComposerModelLabel}
                            active={overlayMenu === "model"}
                            onPress={toggleModelMenu}
                          />
                          {composerTraits ? (
                            <>
                              {responsiveLayout.showComposerDividers ? <FooterDivider /> : null}
                              <ToolbarButton
                                icon={composerTraitsIcon(draftProvider)}
                                label={
                                  responsiveLayout.showComposerTraitsLabel
                                    ? truncateToolbarLabel(composerTraits, 14)
                                    : undefined
                                }
                                compact={!responsiveLayout.showComposerTraitsLabel}
                                active={overlayMenu === "traits"}
                                onPress={toggleTraitsMenu}
                              />
                            </>
                          ) : null}
                          {responsiveLayout.showComposerDividers ? <FooterDivider /> : null}
                          <ToolbarButton
                            icon={interactionIcon(draftInteractionMode)}
                            label={
                              responsiveLayout.showComposerModeLabels
                                ? interactionLabel(draftInteractionMode)
                                : undefined
                            }
                            compact={!responsiveLayout.showComposerModeLabels}
                            active={draftInteractionMode === "plan"}
                            onPress={toggleInteractionMode}
                          />
                          {responsiveLayout.showComposerDividers ? <FooterDivider /> : null}
                          <ToolbarButton
                            icon={runtimeFooterIcon(draftRuntimeMode)}
                            label={
                              responsiveLayout.showComposerModeLabels
                                ? runtimeFooterLabel(draftRuntimeMode)
                                : undefined
                            }
                            compact={!responsiveLayout.showComposerModeLabels}
                            active={draftRuntimeMode === "approval-required"}
                            onPress={toggleRuntimeMode}
                          />
                        </box>
                        {activePendingProgress ? (
                          <>
                            {activePendingProgress.questionIndex > 0 ? (
                              <ToolbarButton
                                label="Previous"
                                disabled={activePendingIsResponding}
                                onPress={() => {
                                  setActivePendingUserInputQuestionIndex(
                                    activePendingProgress.questionIndex - 1,
                                  );
                                }}
                              />
                            ) : null}
                            <ComposerSendButton
                              icon={activePendingProgress.isLastQuestion ? "↑" : "→"}
                              label={
                                activePendingIsResponding
                                  ? "Submitting"
                                  : activePendingProgress.isLastQuestion
                                    ? "Submit answers"
                                    : "Next question"
                              }
                              disabled={
                                activePendingIsResponding ||
                                (activePendingProgress.isLastQuestion
                                  ? !activePendingResolvedAnswers
                                  : !activePendingProgress.canAdvance)
                              }
                              onPress={() => {
                                void advanceActivePendingUserInput();
                              }}
                            />
                          </>
                        ) : (
                          <ComposerSendButton
                            icon={composerPrimaryAction === "stop" ? "■" : "↑"}
                            variant={composerPrimaryAction}
                            disabled={
                              imagePasteInFlight ||
                              (composerPrimaryAction === "send" && !composerHasSendableContent)
                            }
                            onPress={() => {
                              if (imagePasteInFlight) {
                                return;
                              }
                              if (composerPrimaryAction === "send") {
                                void sendPrompt();
                              } else {
                                void interruptActiveTurn();
                              }
                            }}
                          />
                        )}
                      </>
                    )}
                  </box>
                  {activeProjectId && isGitRepo ? (
                    <box
                      style={{
                        position: "absolute",
                        left: 1,
                        right: 1,
                        bottom: -1,
                        zIndex: 30,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: "transparent",
                        paddingLeft: 0,
                        paddingRight: 0,
                      }}
                    >
                      <box
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: PALETTE.composerPanel,
                          paddingLeft: 1,
                          paddingRight: 1,
                        }}
                      >
                        <ToolbarButton
                          icon={effectiveThreadEnvMode === "worktree" ? "󰙅" : "󰉋"}
                          label={effectiveThreadEnvMode === "worktree" ? "New worktree" : "Local"}
                          compact
                          chrome="bare"
                          active={overlayMenu === "composer-env"}
                          disabled={false}
                          onPress={toggleComposerEnvMenu}
                        />
                      </box>
                      <box
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          backgroundColor: PALETTE.composerPanel,
                          paddingLeft: 1,
                          paddingRight: 1,
                        }}
                      >
                        <ToolbarButton
                          icon="󰘬"
                          label={truncateToolbarLabel(composerBranchLabel, 20)}
                          compact
                          chrome="bare"
                          active={overlayMenu === "composer-branch"}
                          disabled={!gitCwd || composerBranchMenuItems.length === 0}
                          onPress={toggleComposerBranchMenu}
                        />
                      </box>
                    </box>
                  ) : null}
                </box>
              </>
            )}
          </box>
        </box>
      </box>

      {imagePreview ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: viewportColumns,
            height: viewportRows,
            backgroundColor: PALETTE.scrim,
            zIndex: 240,
          }}
          onMouseDown={() => closeImagePreview()}
        >
          <box
            style={{
              position: "absolute",
              top: Math.max(1, imagePreviewModalTop - 1),
              left: imagePreviewModalLeft,
              width: imagePreviewModalWidth,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation?.();
            }}
          >
            <text content={`󰋩 ${imagePreview.attachment.name}`} style={{ fg: PALETTE.text }} />
            <box
              style={{
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <text content="Esc" style={{ fg: PALETTE.subtle, marginRight: 1 }} />
              <box
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation?.();
                  closeImagePreview();
                }}
              >
                <text content="✕" style={{ fg: PALETTE.text }} />
              </box>
            </box>
          </box>

          {!terminalImageSupport.supported ||
          imagePreview.status === "loading" ||
          imagePreview.status === "error" ? (
            <box
              style={{
                position: "absolute",
                top:
                  imagePreviewModalTop + Math.max(2, Math.floor(imagePreviewModalHeight / 2) - 1),
                left: imagePreviewModalLeft,
                width: imagePreviewModalWidth,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation?.();
              }}
            >
              {!terminalImageSupport.supported ? (
                <text content={terminalImageSupport.reason} style={{ fg: PALETTE.muted }} />
              ) : imagePreview.status === "loading" ? (
                <text content="Loading image preview..." style={{ fg: PALETTE.muted }} />
              ) : (
                <text
                  content={imagePreview.error ?? "Image preview failed."}
                  style={{ fg: PALETTE.warning }}
                />
              )}
            </box>
          ) : null}
        </box>
      ) : null}

      {overlayMenu === "model" && modelPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: modelPopupPosition.top,
            left: modelPopupPosition.left,
            width: modelPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: modelSubmenuOpen ? "row" : "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          <box
            style={{
              width: MODEL_POPUP_PROVIDER_COLUMN_WIDTH,
              paddingRight: 1,
              border: ["right"],
              borderColor: PALETTE.border,
              flexDirection: "column",
            }}
          >
            {AVAILABLE_MODEL_PROVIDER_OPTIONS.map((option) => (
              <PopupRow
                key={`provider:${option.value}`}
                icon={providerPickerIcon(option.value)}
                iconColor={providerColor(option.value)}
                label={option.label}
                active={modelMenuProvider === option.value}
                onHover={() => focusModelProvider(option.value)}
                onPress={() => focusModelProvider(option.value)}
              />
            ))}
            {COMING_SOON_MODEL_PROVIDER_OPTIONS.length > 0 ? (
              <>
                {COMING_SOON_MODEL_PROVIDER_OPTIONS.map((option) => (
                  <PopupRow
                    key={`provider-soon:${option.id}`}
                    icon={providerPickerIcon(option.id)}
                    label={option.label}
                    disabled
                    trailingLabel="Soon"
                    onPress={() => {}}
                  />
                ))}
              </>
            ) : null}
          </box>
          {modelSubmenuOpen ? (
            <box style={{ flexGrow: 1, flexDirection: "column", paddingLeft: 1 }}>
              {modelOptions.slice(0, modelMenuHeight).map((option, index) => (
                <PopupRow
                  key={`${modelMenuProvider}:${option.slug}`}
                  icon={
                    option.slug === draftModel && modelMenuProvider === draftProvider ? "󰄬" : " "
                  }
                  label={option.name}
                  active={index === modelMenuIndex}
                  onHover={() => setModelMenuIndex(index)}
                  onPress={() => applyDraftProviderModel(modelMenuProvider, option.slug)}
                />
              ))}
            </box>
          ) : null}
        </box>
      ) : null}

      {overlayMenu === "composer-env" && composerEnvPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: composerEnvPopupPosition.top,
            left: composerEnvPopupPosition.left,
            width: composerEnvPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 0,
            paddingRight: 0,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          {composerEnvMenuItems.map((item, index) => (
            <PopupRow
              key={`composer-env:${item.id}`}
              icon={item.selected ? "󰄬" : item.icon}
              label={item.label}
              active={index === composerEnvMenuIndex}
              onHover={() => setComposerEnvMenuIndex(index)}
              onPress={item.onSelect}
            />
          ))}
        </box>
      ) : null}

      {overlayMenu === "composer-branch" && composerBranchPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: composerBranchPopupPosition.top,
            left: composerBranchPopupPosition.left,
            width: composerBranchPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          {composerBranchMenuItems.length > 0 ? (
            <scrollbox
              ref={composerBranchScrollRef}
              focused={focusArea === "controls"}
              onMouseScroll={() => {
                setFocusArea("controls");
              }}
              style={{
                height: composerBranchVisibleRowCount,
                minHeight: composerBranchVisibleRowCount,
                ...themedScrollboxStyle(PALETTE.popup),
              }}
            >
              {composerBranchMenuItems.map((item, index) => (
                <PopupRow
                  key={`composer-branch:${item.id}`}
                  icon={item.selected ? "󰄬" : item.branch.isRemote ? "󰘬" : "󰊢"}
                  label={truncateTitleForDisplay(item.label, 24)}
                  active={index === composerBranchMenuIndex}
                  {...(item.trailingLabel ? { trailingLabel: item.trailingLabel } : {})}
                  onPress={() => {
                    void selectComposerBranch(item);
                  }}
                />
              ))}
            </scrollbox>
          ) : (
            <text content="No branches found." style={{ fg: PALETTE.muted }} />
          )}
        </box>
      ) : null}

      {overlayMenu === "settings-select" && settingsSelectPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: settingsSelectPopupPosition.top,
            left: settingsSelectPopupPosition.left,
            width: settingsSelectPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          <text content={settingsSelectTitle} style={{ fg: PALETTE.subtle, marginBottom: 1 }} />
          {settingsSelectItems.slice(0, settingsSelectMenuHeight).map((option, index) => (
            <PopupRow
              key={`settings-select:${settingsSelectKind}:${option.id}`}
              icon={option.selected ? "󰄬" : " "}
              label={option.label}
              active={index === settingsSelectIndex}
              onHover={() => setSettingsSelectIndex(index)}
              onPress={option.onSelect}
            />
          ))}
        </box>
      ) : null}

      {overlayMenu === "sidebar-sort" && sidebarSortPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: sidebarSortPopupPosition.top,
            left: sidebarSortPopupPosition.left,
            width: sidebarSortPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          {sidebarSortItems.map((item, index) => {
            const showSection =
              index === 0 || sidebarSortItems[index - 1]?.section !== item.section;
            return (
              <box key={item.id} style={{ flexDirection: "column" }}>
                {showSection ? (
                  <text
                    content={item.section}
                    style={{
                      fg: PALETTE.subtle,
                      marginTop: index === 0 ? 0 : 1,
                    }}
                  />
                ) : null}
                <PopupRow
                  icon={item.selected ? "󰄬" : " "}
                  label={item.label}
                  active={index === sidebarSortIndex}
                  onHover={() => setSidebarSortIndex(index)}
                  onPress={item.onSelect}
                />
              </box>
            );
          })}
        </box>
      ) : null}

      {overlayMenu === "git-actions" && gitPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: gitPopupPosition.top,
            left: gitPopupPosition.left,
            width: gitPopupWidth,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          <text content="Git actions" style={{ fg: PALETTE.subtle, marginBottom: 1 }} />
          {gitMenuItems.length > 0 ? (
            gitMenuItems.map((item, index) => (
              <PopupRow
                key={`git-actions:${item.id}`}
                icon={item.icon}
                label={item.label}
                active={index === gitMenuIndex}
                disabled={item.disabled}
                onHover={() => setGitMenuIndex(index)}
                onPress={() => {
                  void activateGitMenuItem(item);
                }}
              />
            ))
          ) : (
            <text
              content={gitStateError ?? "No git actions available."}
              style={{ fg: gitStateError ? PALETTE.warning : PALETTE.muted }}
            />
          )}
          <text
            content={
              gitActionStatus ??
              gitStateError ??
              gitQuickAction.hint ??
              (gitStatusForActions?.branch ? `On ${gitStatusForActions.branch}` : "Ready")
            }
            style={{
              fg: gitStateError ? PALETTE.warning : PALETTE.subtle,
              marginTop: 1,
            }}
          />
        </box>
      ) : null}

      {overlayMenu === "traits" && traitsPopupPosition ? (
        <box
          style={{
            position: "absolute",
            top: traitsPopupPosition.top,
            left: traitsPopupPosition.left,
            width: POPUP_MENU_WIDTH,
            backgroundColor: PALETTE.popup,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            zIndex: 200,
            flexDirection: "column",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation?.();
          }}
        >
          {traitsMenuItems.length === 0 ? (
            <text content="No options for this model" style={{ fg: PALETTE.muted }} />
          ) : (
            traitsMenuItems.map((item, index) => {
              const showSection =
                index === 0 || traitsMenuItems[index - 1]?.section !== item.section;
              return (
                <box key={item.id} style={{ flexDirection: "column" }}>
                  {showSection ? (
                    <text
                      content={item.section}
                      style={{
                        fg: PALETTE.subtle,
                        marginTop: index === 0 ? 0 : 1,
                      }}
                    />
                  ) : null}
                  <PopupRow
                    icon={item.selected ? "󰄬" : " "}
                    label={item.label}
                    active={index === traitsMenuIndex}
                    onHover={() => setTraitsMenuIndex(index)}
                    onPress={item.onSelect}
                  />
                </box>
              );
            })
          )}
        </box>
      ) : null}

      {sidebarContextMenu && sidebarContextMenuPosition ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 240,
          }}
          onMouseDown={() => {
            closeSidebarContextMenu();
          }}
        >
          <box
            style={{
              position: "absolute",
              top: sidebarContextMenuPosition.top,
              left: sidebarContextMenuPosition.left,
              width: 28,
              backgroundColor: PALETTE.popup,
              paddingTop: 1,
              paddingBottom: 1,
              zIndex: 241,
              flexDirection: "column",
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {sidebarContextMenuItems.map((item, index) => (
              <PopupRow
                key={`${sidebarContextMenu.kind}:${item.id}`}
                icon={
                  item.destructive ? "󰆴" : index === sidebarContextMenu.selectedIndex ? "󰄬" : " "
                }
                label={item.label}
                active={index === sidebarContextMenu.selectedIndex}
                {...(item.destructive ? { iconColor: "#fda4af" } : {})}
                onHover={() =>
                  setSidebarContextMenu((current) =>
                    current
                      ? {
                          ...current,
                          selectedIndex: index,
                        }
                      : current,
                  )
                }
                onPress={() => {
                  if (sidebarContextMenu.kind === "thread") {
                    const thread = allThreads.find(
                      (entry) => entry.id === sidebarContextMenu.threadId,
                    );
                    if (thread) {
                      void handleThreadContextAction(item.id, thread);
                    }
                    return;
                  }
                  if (sidebarContextMenu.kind === "multi-thread") {
                    void handleMultiThreadContextAction(item.id, sidebarContextMenu.threadIds);
                    return;
                  }
                  if (sidebarContextMenu.kind === "project") {
                    const project = projects.find(
                      (entry) => entry.id === sidebarContextMenu.projectId,
                    );
                    if (project) {
                      void handleProjectContextAction(item.id, project);
                    }
                  }
                }}
              />
            ))}
          </box>
        </box>
      ) : null}

      {renameThreadDialog ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: PALETTE.scrim,
            zIndex: 260,
            justifyContent: "center",
            alignItems: "center",
          }}
          onMouseDown={() => {
            setRenameThreadDialog(null);
          }}
        >
          <box
            style={{
              width: 56,
              maxWidth: "80%",
              flexDirection: "column",
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <text content="Rename thread" style={{ fg: PALETTE.text, marginBottom: 1 }} />
            <box
              style={{
                backgroundColor: PALETTE.input,
                paddingLeft: 1,
                paddingRight: 1,
                height: 3,
                justifyContent: "center",
              }}
            >
              <input
                focused
                value={renameThreadDialog.value}
                onInput={(value) => {
                  setRenameThreadDialog((current) =>
                    current
                      ? {
                          ...current,
                          value,
                        }
                      : current,
                  );
                }}
                onKeyDown={(key) => {
                  if (key.name === "escape") {
                    key.preventDefault();
                    setRenameThreadDialog(null);
                    return;
                  }
                  if (
                    key.name === "return" ||
                    key.name === "enter" ||
                    key.name === "kpenter" ||
                    key.name === "linefeed"
                  ) {
                    key.preventDefault();
                    void submitRenameThread();
                  }
                }}
                cursorColor={PALETTE.cursor}
                style={{
                  backgroundColor: PALETTE.input,
                  focusedBackgroundColor: PALETTE.input,
                  textColor: PALETTE.text,
                  focusedTextColor: PALETTE.text,
                  placeholderColor: PALETTE.subtle,
                }}
              />
            </box>
            <text
              content="Press Enter to save or Escape to cancel."
              style={{ fg: PALETTE.subtle, marginTop: 1 }}
            />
          </box>
        </box>
      ) : null}

      {confirmDialog ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: PALETTE.scrim,
            zIndex: 270,
            justifyContent: "center",
            alignItems: "center",
          }}
          onMouseDown={() => {
            setConfirmDialog(null);
          }}
        >
          <box
            style={{
              width: 60,
              maxWidth: "80%",
              backgroundColor: PALETTE.popup,
              paddingTop: 1,
              paddingBottom: 1,
              paddingLeft: 1,
              paddingRight: 1,
              flexDirection: "column",
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <text content={confirmDialog.title} style={{ fg: PALETTE.text, marginBottom: 1 }} />
            {confirmDialog.body ? (
              <text content={confirmDialog.body} style={{ fg: PALETTE.muted, marginBottom: 1 }} />
            ) : null}
            <box style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <ToolbarButton
                label="Cancel"
                onPress={() => {
                  setConfirmDialog(null);
                }}
              />
              <ToolbarButton
                label={confirmDialog.confirmLabel}
                active
                onPress={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  void action();
                }}
              />
            </box>
          </box>
        </box>
      ) : null}

      {projectPathPromptOpen ? (
        <box
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: PALETTE.scrim,
            zIndex: 280,
            justifyContent: "center",
            alignItems: "center",
          }}
          onMouseDown={() => {
            closeProjectPathPrompt();
          }}
        >
          <box
            style={{
              width: 64,
              maxWidth: "80%",
              flexDirection: "column",
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <box
              style={{
                backgroundColor: PALETTE.input,
                paddingLeft: 1,
                paddingRight: 1,
                height: 3,
                justifyContent: "center",
              }}
            >
              <input
                key={projectPathResetKey}
                ref={projectPathRef}
                focused={projectPathPromptOpen}
                value={projectPathDraft}
                onInput={(value) => {
                  setProjectPathDraft(value);
                  setProjectPathError(null);
                }}
                onKeyDown={(key) => {
                  if (key.name === "escape") {
                    key.preventDefault();
                    closeProjectPathPrompt();
                    return;
                  }
                  if (key.name === "tab") {
                    const suggestion = projectPathSuggestions[0];
                    if (suggestion) {
                      key.preventDefault();
                      applyProjectSuggestion(suggestion);
                    }
                    return;
                  }
                  if (
                    key.name === "return" ||
                    key.name === "enter" ||
                    key.name === "kpenter" ||
                    key.name === "linefeed"
                  ) {
                    key.preventDefault();
                    void submitProjectPath(projectPathRef.current?.plainText ?? projectPathDraft);
                  }
                }}
                onPaste={() => {
                  syncProjectPathFromTextarea();
                }}
                placeholder="~/src/project or ../other-repo"
                cursorColor={PALETTE.cursor}
                style={{
                  backgroundColor: PALETTE.input,
                  focusedBackgroundColor: PALETTE.input,
                  textColor: PALETTE.text,
                  focusedTextColor: PALETTE.text,
                  placeholderColor: PALETTE.subtle,
                }}
              />
            </box>
            {projectPathError ? (
              <text content={projectPathError} style={{ fg: PALETTE.warning, marginTop: 1 }} />
            ) : null}
            {projectPathSuggestions.length > 0 ? (
              <box
                style={{
                  flexDirection: "column",
                  backgroundColor: PALETTE.popup,
                  paddingTop: 1,
                  paddingBottom: 1,
                }}
              >
                {projectPathSuggestions.map((suggestion) => (
                  <SidebarRow
                    key={suggestion}
                    compact
                    activeBackgroundColor={PALETTE.controlActive}
                    onPress={() => {
                      applyProjectSuggestion(suggestion);
                    }}
                  >
                    <text content="󰉋" style={{ fg: PALETTE.muted, marginRight: 1 }} />
                    <box
                      style={{
                        backgroundColor: PALETTE.surfaceAlt,
                        paddingLeft: 1,
                        paddingRight: 1,
                        flexGrow: 1,
                        overflow: "hidden",
                      }}
                    >
                      <text content={suggestion} style={{ fg: PALETTE.text }} />
                    </box>
                  </SidebarRow>
                ))}
              </box>
            ) : null}
          </box>
        </box>
      ) : null}
    </box>
  );
}
function canInterruptActiveTurn(thread: ThreadReadModel | null): boolean {
  if (!thread) {
    return false;
  }
  if (isThreadActivelyWorking(thread)) {
    return true;
  }
  if (thread.session?.activeTurnId) {
    return true;
  }
  return thread.latestTurn?.state === "running";
}

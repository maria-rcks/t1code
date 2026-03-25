import type { AppSettings } from "@t3tools/client-core";
import {
  type ProjectEntry,
  type ProviderKind,
  type ProviderModelOptions,
  type RuntimeMode,
} from "@t3tools/contracts";
import fs from "node:fs/promises";
import path from "node:path";
import type { TuiPaths } from "./config";

export interface PersistedComposerImageAttachment {
  readonly type: "image";
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly localPath?: string;
}

export interface PersistedComposerMention {
  readonly type: "path";
  readonly path: string;
  readonly kind: ProjectEntry["kind"];
  readonly parentPath?: string;
}

export interface PersistedComposerDraft {
  readonly text: string;
  readonly attachments: readonly PersistedComposerImageAttachment[];
  readonly mentions?: readonly PersistedComposerMention[];
}

export interface PersistedDraftThreadState {
  readonly id: string;
  readonly projectId: string;
}

export interface TuiPrefs {
  readonly selectedProjectId?: string;
  readonly selectedThreadId?: string;
  readonly expandedProjectIds?: readonly string[];
  readonly locallyUnreadThreadIds?: readonly string[];
  readonly threadLastVisitedAtById?: Readonly<Record<string, string>>;
  readonly draftThreadsByProjectId?: Readonly<Record<string, PersistedDraftThreadState>>;
  readonly composerDraftsByThreadId?: Readonly<Record<string, PersistedComposerDraft>>;
  readonly mainView?: "thread" | "settings" | "keybindings";
  readonly draftProvider?: ProviderKind;
  readonly draftModel?: string;
  readonly draftModelOptions?: ProviderModelOptions;
  readonly draftRuntimeMode?: RuntimeMode;
  readonly draftInteractionMode?: "default" | "plan";
  readonly diffOpen?: boolean;
  readonly diffView?: "unified" | "split";
  readonly appSettings?: AppSettings;
}

export async function readPrefs(paths: TuiPaths): Promise<TuiPrefs> {
  try {
    const raw = await fs.readFile(paths.prefsPath, "utf8");
    const parsed = JSON.parse(raw) as TuiPrefs;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function writePrefs(paths: TuiPaths, prefs: TuiPrefs): Promise<void> {
  await fs.mkdir(path.dirname(paths.prefsPath), { recursive: true });
  await fs.writeFile(paths.prefsPath, JSON.stringify(prefs, null, 2));
}

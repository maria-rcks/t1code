import {
  type ContextMenuItem,
  type GitActionProgressEvent,
  type NativeApi,
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  type ServerConfigUpdatedPayload,
  WS_CHANNELS,
  WS_METHODS,
  type WsWelcomePayload,
} from "@t3tools/contracts";
import { WsTransport } from "./wsTransport";

export interface NativeApiAdapterOptions {
  readonly transport: WsTransport;
  readonly dialogs?: {
    pickFolder?: () => Promise<string | null>;
    confirm?: (message: string) => Promise<boolean>;
  };
  readonly shell?: {
    openExternal?: (url: string) => Promise<void>;
  };
  readonly contextMenu?: {
    show?: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
}

export interface NativeApiEvents {
  readonly onServerWelcome: (listener: (payload: WsWelcomePayload) => void) => () => void;
  readonly onServerConfigUpdated: (
    listener: (payload: ServerConfigUpdatedPayload) => void,
  ) => () => void;
  readonly onGitActionProgress: (listener: (payload: GitActionProgressEvent) => void) => () => void;
}

export function createTransportNativeApi(options: NativeApiAdapterOptions): {
  api: NativeApi;
  events: NativeApiEvents;
} {
  const welcomeListeners = new Set<(payload: WsWelcomePayload) => void>();
  const serverConfigUpdatedListeners = new Set<(payload: ServerConfigUpdatedPayload) => void>();
  const gitActionProgressListeners = new Set<(payload: GitActionProgressEvent) => void>();
  const { transport } = options;

  transport.subscribe(WS_CHANNELS.serverWelcome, (message) => {
    for (const listener of welcomeListeners) {
      listener(message.data);
    }
  });
  transport.subscribe(WS_CHANNELS.serverConfigUpdated, (message) => {
    for (const listener of serverConfigUpdatedListeners) {
      listener(message.data);
    }
  });
  transport.subscribe(WS_CHANNELS.gitActionProgress, (message) => {
    for (const listener of gitActionProgressListeners) {
      listener(message.data);
    }
  });

  const api: NativeApi = {
    dialogs: {
      pickFolder: async () =>
        options.dialogs?.pickFolder ? await options.dialogs.pickFolder() : null,
      confirm: async (message) =>
        options.dialogs?.confirm ? await options.dialogs.confirm(message) : false,
    },
    terminal: {
      open: (input) => transport.request(WS_METHODS.terminalOpen, input),
      write: (input) => transport.request(WS_METHODS.terminalWrite, input),
      resize: (input) => transport.request(WS_METHODS.terminalResize, input),
      clear: (input) => transport.request(WS_METHODS.terminalClear, input),
      restart: (input) => transport.request(WS_METHODS.terminalRestart, input),
      close: (input) => transport.request(WS_METHODS.terminalClose, input),
      onEvent: (callback) =>
        transport.subscribe(WS_CHANNELS.terminalEvent, (message) => callback(message.data)),
    },
    projects: {
      searchEntries: (input) => transport.request(WS_METHODS.projectsSearchEntries, input),
      writeFile: (input) => transport.request(WS_METHODS.projectsWriteFile, input),
    },
    shell: {
      openInEditor: (cwd, editor) =>
        transport.request(WS_METHODS.shellOpenInEditor, { cwd, editor }),
      openExternal: async (url) => {
        if (options.shell?.openExternal) {
          await options.shell.openExternal(url);
          return;
        }
        throw new Error(`Unable to open external URL: ${url}`);
      },
    },
    git: {
      pull: (input) => transport.request(WS_METHODS.gitPull, input),
      status: (input) => transport.request(WS_METHODS.gitStatus, input),
      runStackedAction: (input) =>
        transport.request(WS_METHODS.gitRunStackedAction, input, { timeoutMs: null }),
      listBranches: (input) => transport.request(WS_METHODS.gitListBranches, input),
      createWorktree: (input) => transport.request(WS_METHODS.gitCreateWorktree, input),
      removeWorktree: (input) => transport.request(WS_METHODS.gitRemoveWorktree, input),
      createBranch: (input) => transport.request(WS_METHODS.gitCreateBranch, input),
      checkout: (input) => transport.request(WS_METHODS.gitCheckout, input),
      init: (input) => transport.request(WS_METHODS.gitInit, input),
      resolvePullRequest: (input) => transport.request(WS_METHODS.gitResolvePullRequest, input),
      preparePullRequestThread: (input) =>
        transport.request(WS_METHODS.gitPreparePullRequestThread, input),
      onActionProgress: (callback) => {
        gitActionProgressListeners.add(callback);
        return () => {
          gitActionProgressListeners.delete(callback);
        };
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ) => {
        if (options.contextMenu?.show) {
          return await options.contextMenu.show(items, position);
        }
        return null;
      },
    },
    server: {
      getConfig: () => transport.request(WS_METHODS.serverGetConfig),
      upsertKeybinding: (input) => transport.request(WS_METHODS.serverUpsertKeybinding, input),
    },
    orchestration: {
      getSnapshot: () => transport.request(ORCHESTRATION_WS_METHODS.getSnapshot),
      dispatchCommand: (command) =>
        transport.request(ORCHESTRATION_WS_METHODS.dispatchCommand, { command }),
      getTurnDiff: (input) => transport.request(ORCHESTRATION_WS_METHODS.getTurnDiff, input),
      getFullThreadDiff: (input) =>
        transport.request(ORCHESTRATION_WS_METHODS.getFullThreadDiff, input),
      replayEvents: (fromSequenceExclusive) =>
        transport.request(ORCHESTRATION_WS_METHODS.replayEvents, { fromSequenceExclusive }),
      onDomainEvent: (callback) =>
        transport.subscribe(ORCHESTRATION_WS_CHANNELS.domainEvent, (message) =>
          callback(message.data),
        ),
    },
  };

  return {
    api,
    events: {
      onServerWelcome: (listener) => {
        welcomeListeners.add(listener);
        const latest = transport.getLatestPush(WS_CHANNELS.serverWelcome)?.data;
        if (latest) {
          listener(latest);
        }
        return () => {
          welcomeListeners.delete(listener);
        };
      },
      onServerConfigUpdated: (listener) => {
        serverConfigUpdatedListeners.add(listener);
        const latest = transport.getLatestPush(WS_CHANNELS.serverConfigUpdated)?.data;
        if (latest) {
          listener(latest);
        }
        return () => {
          serverConfigUpdatedListeners.delete(listener);
        };
      },
      onGitActionProgress: (listener) => {
        gitActionProgressListeners.add(listener);
        return () => {
          gitActionProgressListeners.delete(listener);
        };
      },
    },
  };
}

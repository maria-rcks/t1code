import type {
  ContextMenuItem,
  GitActionProgressEvent,
  NativeApi,
  ServerConfigUpdatedPayload,
  WsWelcomePayload,
} from "@t3tools/contracts";
import { createTransportNativeApi } from "@t3tools/client-core";

import { showContextMenuFallback } from "./contextMenuFallback";
import { WsTransport } from "./wsTransport";

let instance: { api: NativeApi; transport: WsTransport } | null = null;
const welcomeListeners = new Set<(payload: WsWelcomePayload) => void>();
const serverConfigUpdatedListeners = new Set<(payload: ServerConfigUpdatedPayload) => void>();
const gitActionProgressListeners = new Set<(payload: GitActionProgressEvent) => void>();

export function onServerWelcome(listener: (payload: WsWelcomePayload) => void): () => void {
  welcomeListeners.add(listener);
  return () => {
    welcomeListeners.delete(listener);
  };
}

export function onServerConfigUpdated(
  listener: (payload: ServerConfigUpdatedPayload) => void,
): () => void {
  serverConfigUpdatedListeners.add(listener);
  return () => {
    serverConfigUpdatedListeners.delete(listener);
  };
}

export function createWsNativeApi(): NativeApi {
  if (instance) return instance.api;

  const transport = new WsTransport();
  const { api, events } = createTransportNativeApi({
    transport,
    dialogs: {
      pickFolder: async () => {
        if (!window.desktopBridge) return null;
        return await window.desktopBridge.pickFolder();
      },
      confirm: async (message) => {
        if (window.desktopBridge) {
          return await window.desktopBridge.confirm(message);
        }
        return window.confirm(message);
      },
    },
    shell: {
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ) => {
        if (window.desktopBridge) {
          return await (window.desktopBridge.showContextMenu(items, position) as Promise<T | null>);
        }
        return await showContextMenuFallback(items, position);
      },
    },
  });

  events.onServerWelcome((payload) => {
    for (const listener of welcomeListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  events.onServerConfigUpdated((payload) => {
    for (const listener of serverConfigUpdatedListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });
  events.onGitActionProgress((payload) => {
    for (const listener of gitActionProgressListeners) {
      try {
        listener(payload);
      } catch {
        // Swallow listener errors
      }
    }
  });

  instance = { api, transport };
  return api;
}

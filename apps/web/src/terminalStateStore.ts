import type { ThreadId } from "@t3tools/contracts";
import {
  type ThreadTerminalState,
  closeThreadTerminal,
  createDefaultThreadTerminalState,
  newThreadTerminal,
  selectThreadTerminalState,
  setThreadActiveTerminal,
  setThreadTerminalActivity,
  setThreadTerminalHeight,
  setThreadTerminalOpen,
  splitThreadTerminal,
  updateTerminalStateByThreadId,
} from "@t3tools/client-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const TERMINAL_STATE_STORAGE_KEY = "t3code:terminal-state:v1";

export { selectThreadTerminalState } from "@t3tools/client-core";

interface TerminalStateStoreState {
  terminalStateByThreadId: Record<ThreadId, ThreadTerminalState>;
  setTerminalOpen: (threadId: ThreadId, open: boolean) => void;
  setTerminalHeight: (threadId: ThreadId, height: number) => void;
  splitTerminal: (threadId: ThreadId, terminalId: string) => void;
  newTerminal: (threadId: ThreadId, terminalId: string) => void;
  setActiveTerminal: (threadId: ThreadId, terminalId: string) => void;
  closeTerminal: (threadId: ThreadId, terminalId: string) => void;
  setTerminalActivity: (
    threadId: ThreadId,
    terminalId: string,
    hasRunningSubprocess: boolean,
  ) => void;
  clearTerminalState: (threadId: ThreadId) => void;
  removeOrphanedTerminalStates: (activeThreadIds: Set<ThreadId>) => void;
}

export const useTerminalStateStore = create<TerminalStateStoreState>()(
  persist(
    (set) => {
      const updateTerminal = (
        threadId: ThreadId,
        updater: (state: ThreadTerminalState) => ThreadTerminalState,
      ) => {
        set((state) => {
          const nextTerminalStateByThreadId = updateTerminalStateByThreadId(
            state.terminalStateByThreadId,
            threadId,
            updater,
          );
          if (nextTerminalStateByThreadId === state.terminalStateByThreadId) {
            return state;
          }
          return {
            terminalStateByThreadId: nextTerminalStateByThreadId,
          };
        });
      };

      return {
        terminalStateByThreadId: {},
        setTerminalOpen: (threadId, open) =>
          updateTerminal(threadId, (state) => setThreadTerminalOpen(state, open)),
        setTerminalHeight: (threadId, height) =>
          updateTerminal(threadId, (state) => setThreadTerminalHeight(state, height)),
        splitTerminal: (threadId, terminalId) =>
          updateTerminal(threadId, (state) => splitThreadTerminal(state, terminalId)),
        newTerminal: (threadId, terminalId) =>
          updateTerminal(threadId, (state) => newThreadTerminal(state, terminalId)),
        setActiveTerminal: (threadId, terminalId) =>
          updateTerminal(threadId, (state) => setThreadActiveTerminal(state, terminalId)),
        closeTerminal: (threadId, terminalId) =>
          updateTerminal(threadId, (state) => closeThreadTerminal(state, terminalId)),
        setTerminalActivity: (threadId, terminalId, hasRunningSubprocess) =>
          updateTerminal(threadId, (state) =>
            setThreadTerminalActivity(state, terminalId, hasRunningSubprocess),
          ),
        clearTerminalState: (threadId) =>
          updateTerminal(threadId, () => createDefaultThreadTerminalState()),
        removeOrphanedTerminalStates: (activeThreadIds) =>
          set((state) => {
            const orphanedIds = Object.keys(state.terminalStateByThreadId).filter(
              (id) => !activeThreadIds.has(id as ThreadId),
            );
            if (orphanedIds.length === 0) return state;
            const next = { ...state.terminalStateByThreadId };
            for (const id of orphanedIds) {
              delete next[id as ThreadId];
            }
            return { terminalStateByThreadId: next };
          }),
      };
    },
    {
      name: TERMINAL_STATE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        terminalStateByThreadId: state.terminalStateByThreadId,
      }),
    },
  ),
);

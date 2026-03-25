export * from "@t3tools/client-core/types";

export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
export const DEFAULT_THREAD_TERMINAL_ID = "default";
export const MAX_TERMINALS_PER_GROUP = 4;

export interface ThreadTerminalGroup {
  id: string;
  terminalIds: string[];
}

import {
  extractSlashCommandQuery,
  matchSlashCommands,
  type SlashCommandDefinition,
} from "@t3tools/client-core";

export const TUI_SLASH_COMMAND_MENU_LIMIT = 8;

export type TuiSlashCommandMenu = {
  query: string;
  items: SlashCommandDefinition[];
};

export function resolveTuiSlashCommandMenu(input: {
  composer: string;
  focused: boolean;
  blocked?: boolean;
  limit?: number;
}): TuiSlashCommandMenu | null {
  if (!input.focused || input.blocked) {
    return null;
  }

  const query = extractSlashCommandQuery(input.composer);
  if (query === null) {
    return null;
  }

  return {
    query,
    items: matchSlashCommands(query).slice(0, input.limit ?? TUI_SLASH_COMMAND_MENU_LIMIT),
  };
}

export function clampSlashCommandMenuIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), itemCount - 1);
}

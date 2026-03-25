export interface SlashCommandDefinition {
  command: string;
  usage: string;
  description: string;
  template: string;
}

export const SLASH_COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = [
  {
    command: "help",
    usage: "/help",
    description: "Show available composer commands",
    template: "/help",
  },
  {
    command: "project",
    usage: "/project add <path>",
    description: "Add a project from a path or use /project cwd",
    template: "/project add ",
  },
  {
    command: "thread",
    usage: "/thread new [title]",
    description: "Create a new thread in the active project",
    template: "/thread new ",
  },
  {
    command: "provider",
    usage: "/provider codex",
    description: "Switch provider to codex or claude",
    template: "/provider codex",
  },
  {
    command: "runtime",
    usage: "/runtime full-access",
    description: "Switch runtime between full-access and approval-required",
    template: "/runtime full-access",
  },
  {
    command: "interaction",
    usage: "/interaction plan",
    description: "Switch interaction mode between chat and plan",
    template: "/interaction plan",
  },
  {
    command: "diff",
    usage: "/diff",
    description: "Open the diff rail and refresh the latest diff",
    template: "/diff",
  },
  {
    command: "implement-plan",
    usage: "/implement-plan",
    description: "Load the latest proposed plan into the composer",
    template: "/implement-plan",
  },
  {
    command: "approve",
    usage: "/approve accept",
    description: "Respond to the current approval request",
    template: "/approve accept",
  },
  {
    command: "answer",
    usage: "/answer key=value",
    description: "Submit answers for the current pending input",
    template: "/answer ",
  },
] as const;

const SLASH_COMMAND_NAMES = new Set(SLASH_COMMAND_DEFINITIONS.map((item) => item.command));

export function parseSlashCommandInput(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const match = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const command = (match[1] ?? "").toLowerCase();
  if (!SLASH_COMMAND_NAMES.has(command)) {
    return null;
  }

  return {
    command,
    args: match[2] ?? "",
  };
}

export function matchSlashCommands(query: string): SlashCommandDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...SLASH_COMMAND_DEFINITIONS];
  }

  return SLASH_COMMAND_DEFINITIONS.filter(
    (item) =>
      item.command.startsWith(normalized) ||
      item.usage
        .toLowerCase()
        .split(/[^a-z0-9-]+/i)
        .some((token) => token.startsWith(normalized)),
  );
}

export function extractSlashCommandQuery(input: string): string | null {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const firstLine = trimmed.split("\n", 1)[0] ?? "";
  const match = /^\/([a-z0-9-]*)$/i.exec(firstLine);
  if (!match) {
    return null;
  }

  const query = (match[1] ?? "").toLowerCase();
  if (!query) {
    return "";
  }

  return SLASH_COMMAND_DEFINITIONS.some((item) => item.command.startsWith(query)) ? query : null;
}

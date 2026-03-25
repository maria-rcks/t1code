import type { WorkLogEntry } from "@t3tools/client-core";

function normalizeWorkEntryLabel(entry: WorkLogEntry): string {
  return (entry.toolTitle ?? entry.label)
    .replace(/\s+(?:complete|completed)\s*$/i, "")
    .trim()
    .toLowerCase();
}

function labelSuggestsCommand(label: string): boolean {
  return /(command|terminal|shell|exec|execute|run|test|build|install|start|dev server)/.test(
    label,
  );
}

function labelSuggestsFileRead(label: string): boolean {
  return /(read|view|open|inspect|list|ls|glob|grep|find|search files?|scan workspace|resource)/.test(
    label,
  );
}

function labelSuggestsFileChange(label: string): boolean {
  return /(write|edit|patch|apply|replace|update|create|insert|delete|remove|move|rename|copy)/.test(
    label,
  );
}

function labelSuggestsWeb(label: string): boolean {
  return /(web|browser|fetch|http|url|search query|search web|navigate|click|screenshot|page)/.test(
    label,
  );
}

function labelSuggestsImage(label: string): boolean {
  return /(image|photo|picture|vision|screenshot)/.test(label);
}

export function resolveWorkEntryIcon(entry: WorkLogEntry): string {
  const label = normalizeWorkEntryLabel(entry);

  if (entry.requestKind === "command") return "󰆍";
  if (entry.requestKind === "file-read") return "󰈈";
  if (entry.requestKind === "file-change") return "󰏫";

  if (entry.itemType === "web_search") return "󰖟";
  if (entry.itemType === "image_view") return "󰋩";

  if (entry.itemType === "command_execution" || entry.command || labelSuggestsCommand(label)) {
    return "󰆍";
  }
  if (
    entry.itemType === "file_change" ||
    (entry.changedFiles?.length ?? 0) > 0 ||
    labelSuggestsFileChange(label)
  ) {
    return "󰏫";
  }
  if (labelSuggestsWeb(label)) return "󰖟";
  if (labelSuggestsImage(label)) return "󰋩";
  if (labelSuggestsFileRead(label)) return "󰈈";

  if (entry.itemType === "mcp_tool_call") return "󰒓";
  if (entry.itemType === "dynamic_tool_call" || entry.itemType === "collab_agent_tool_call") {
    return "󰞷";
  }

  if (entry.tone === "error") return "󰀦";
  if (entry.tone === "thinking") return "󰚩";
  if (entry.tone === "info") return "󰄬";
  return "󰓅";
}

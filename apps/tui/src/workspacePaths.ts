import path from "node:path";

export function expandUserPath(input: string, userHomeDir: string): string {
  if (input === "~") return userHomeDir;
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(userHomeDir, input.slice(2));
  }
  return input;
}

export function normalizeWorkspaceRoot(input: string, userHomeDir: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return path.resolve(expandUserPath(trimmed, userHomeDir));
}

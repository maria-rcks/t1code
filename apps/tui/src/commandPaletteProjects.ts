const WINDOWS_ABSOLUTE_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

export function isCommandPaletteProjectPathQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return (
    trimmed === "~" ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("~\\") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith(".\\") ||
    trimmed.startsWith("..\\") ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)
  );
}

export const DEFAULT_THREAD_TITLE = "New thread";

export function truncateTitle(text: string, maxLength = 50): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

export function truncateTitleForDisplay(text: string, maxLength: number): string {
  return truncateTitle(text, maxLength);
}

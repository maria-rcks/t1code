export function formatReasoningEffortLabel(effort: string): string {
  if (effort === "none") return "No reasoning";
  if (effort === "xhigh") return "Extra High";
  if (effort === "max") return "Max";
  if (effort === "ultracode") return "Ultracode";
  if (effort === "ultrathink") return "Ultrathink";
  return effort.slice(0, 1).toUpperCase() + effort.slice(1);
}

export function truncateToolbarLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${label.slice(0, maxLength - 1).trimEnd()}…`;
}

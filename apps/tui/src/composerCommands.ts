import type { ProviderApprovalDecision } from "@t3tools/contracts";

export function parseStandaloneComposerModeCommand(text: string): "plan" | "default" | null {
  const match = /^\/(plan|default)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  return match[1]?.toLowerCase() === "plan" ? "plan" : "default";
}

export function parseApprovalResponseCommand(text: string): ProviderApprovalDecision | null {
  const match = /^\/approve\s+([a-z-]+)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }

  switch ((match[1] ?? "").toLowerCase()) {
    case "accept":
      return "accept";
    case "accept-for-session":
    case "acceptforsession":
      return "acceptForSession";
    case "decline":
      return "decline";
    case "cancel":
      return "cancel";
    default:
      return null;
  }
}

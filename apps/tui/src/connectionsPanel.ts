import type { AdvertisedEndpoint } from "@t3tools/contracts";

export interface TuiServerConnectionInfo {
  readonly host: string;
  readonly port: string;
  readonly authToken: string | null;
}

export function parseTuiServerConnection(rawUrl: string): TuiServerConnectionInfo | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return null;
    }
    return {
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === "wss:" ? "443" : "80"),
      authToken: parsed.searchParams.get("token")?.trim() || null,
    };
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildTuiAttachCommand(input: TuiServerConnectionInfo): string {
  const env: ReadonlyArray<readonly [string, string]> = [
    ["T1CODE_TUI_ATTACH_ONLY", "1"],
    ["T1CODE_HOST", input.host],
    ["T1CODE_PORT", input.port],
    ...(input.authToken ? ([["T1CODE_AUTH_TOKEN", input.authToken]] as const) : []),
  ];
  return `env ${env.map(([key, value]) => `${key}=${shellQuote(value)}`).join(" ")} t1code`;
}

export function formatTuiAttachCommandPreview(input: TuiServerConnectionInfo): string {
  const maskedInput = {
    ...input,
    authToken: input.authToken ? "••••••••" : null,
  };
  return buildTuiAttachCommand(maskedInput);
}

export function formatEndpointStatus(endpoint: AdvertisedEndpoint): string {
  const status =
    endpoint.status === "available"
      ? "Available"
      : endpoint.status === "unavailable"
        ? "Unavailable"
        : "Unknown";
  const reachability =
    endpoint.reachability === "loopback"
      ? "Loopback"
      : endpoint.reachability === "lan"
        ? "LAN"
        : endpoint.reachability === "private-network"
          ? "Private network"
          : "Public";
  return `${status} · ${reachability}`;
}

export function formatEndpointCompatibility(endpoint: AdvertisedEndpoint): string {
  const hosted =
    endpoint.compatibility.hostedHttpsApp === "compatible"
      ? "Hosted HTTPS compatible"
      : endpoint.compatibility.hostedHttpsApp === "mixed-content-blocked"
        ? "Hosted HTTPS blocked"
        : endpoint.compatibility.hostedHttpsApp === "requires-configuration"
          ? "Hosted HTTPS needs setup"
          : "Hosted HTTPS unknown";
  return `${hosted} · Desktop ${endpoint.compatibility.desktopApp}`;
}

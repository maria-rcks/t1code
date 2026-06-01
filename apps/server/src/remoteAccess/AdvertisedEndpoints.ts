import type { AdvertisedEndpoint, AdvertisedEndpointReachability } from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";

const CORE_PROVIDER = {
  id: "t1code-core",
  label: "T1Code",
  kind: "core",
  isAddon: false,
} as const;

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

function isWildcardHost(host: string | undefined): boolean {
  return host === undefined || host === "0.0.0.0" || host === "::" || host === "[::]";
}

function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function resolveAdvertisedHost(host: string | undefined): {
  readonly host: string;
  readonly reachability: AdvertisedEndpointReachability;
} {
  if (host === undefined || isWildcardHost(host)) {
    return { host: "127.0.0.1", reachability: "loopback" };
  }

  return {
    host,
    reachability: isLoopbackHost(host) ? "loopback" : "lan",
  };
}

export function buildCoreAdvertisedEndpoints(input: {
  readonly host: string | undefined;
  readonly port: number;
}): readonly AdvertisedEndpoint[] {
  const advertised = resolveAdvertisedHost(input.host);
  return [
    createAdvertisedEndpoint({
      id: "local-backend",
      label: "Local backend",
      provider: CORE_PROVIDER,
      httpBaseUrl: `http://${formatHostForUrl(advertised.host)}:${input.port}/`,
      reachability: advertised.reachability,
      source: "server",
      status: "available",
      isDefault: true,
      description:
        "Current T1Code backend endpoint for local browsers and attachable TUI sessions.",
    }),
  ];
}

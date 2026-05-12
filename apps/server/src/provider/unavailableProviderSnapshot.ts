import {
  ProviderDriverKind,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { buildServerProvider } from "./providerSnapshot.ts";

export interface UnavailableProviderSnapshotInput {
  readonly driverKind: ProviderDriverKind | string;
  readonly instanceId: ProviderInstanceId;
  readonly displayName?: string | undefined;
  readonly accentColor?: string | undefined;
  readonly reason: string;
  readonly checkedAt?: string;
}

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const decodeProviderDriverKind = Schema.decodeUnknownSync(ProviderDriverKind);

function toProviderDriverKind(value: ProviderDriverKind | string): ProviderDriverKind {
  return typeof value === "string" ? decodeProviderDriverKind(value) : value;
}

export function buildUnavailableProviderSnapshot(
  input: UnavailableProviderSnapshotInput,
): Effect.Effect<ServerProvider> {
  return Effect.gen(function* () {
    const checkedAt = input.checkedAt ?? (yield* nowIso);
    const displayName = input.displayName?.trim() || (input.driverKind as string);

    const base = buildServerProvider({
      presentation: { displayName },
      enabled: false,
      checkedAt,
      models: [],
      skills: [],
      probe: {
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: input.reason,
      },
    });

    return {
      ...base,
      instanceId: input.instanceId,
      ...(input.accentColor ? { accentColor: input.accentColor } : {}),
      driver: toProviderDriverKind(input.driverKind),
      availability: "unavailable",
      unavailableReason: input.reason,
    };
  });
}

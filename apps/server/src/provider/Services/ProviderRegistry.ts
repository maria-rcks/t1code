import type {
  ProviderDriverKind,
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUpdateState,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ProviderMaintenanceCapabilities } from "../providerMaintenance.ts";

export type ProviderMaintenanceActionKind = "update";

export interface ProviderRegistryShape {
  readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly refresh: (provider?: ProviderDriverKind) => Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly refreshInstance: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly getProviderMaintenanceCapabilitiesForInstance: (
    instanceId: ProviderInstanceId,
    provider: ProviderDriverKind,
  ) => Effect.Effect<ProviderMaintenanceCapabilities>;
  readonly setProviderMaintenanceActionState: (input: {
    readonly instanceId: ProviderInstanceId;
    readonly action: ProviderMaintenanceActionKind;
    readonly state: ServerProviderUpdateState | null;
  }) => Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly streamChanges: Stream.Stream<ReadonlyArray<ServerProvider>>;
}

export class ProviderRegistry extends ServiceMap.Service<ProviderRegistry, ProviderRegistryShape>()(
  "t3/provider/Services/ProviderRegistry",
) {}

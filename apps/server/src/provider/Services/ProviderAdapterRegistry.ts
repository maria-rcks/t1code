/**
 * ProviderAdapterRegistry - Lookup boundary for provider adapter implementations.
 *
 * Maps a provider kind to the concrete adapter service (Codex, Claude, etc).
 * It does not own session lifecycle or routing rules; `ProviderService` uses
 * this registry together with `ProviderSessionDirectory`.
 *
 * @module ProviderAdapterRegistry
 */
import type { ProviderDriverKind, ProviderInstanceId, ProviderKind } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type * as PubSub from "effect/PubSub";
import type * as Scope from "effect/Scope";
import type * as Stream from "effect/Stream";

import type { ProviderAdapterError, ProviderUnsupportedError } from "../Errors.ts";
import type { ProviderContinuationIdentity } from "../ProviderDriver.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface ProviderInstanceRoutingInfo {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string | undefined;
  readonly accentColor?: string | undefined;
  readonly enabled: boolean;
  readonly continuationIdentity: ProviderContinuationIdentity;
}

/**
 * ProviderAdapterRegistryShape - Service API for adapter lookup by provider kind.
 */
export interface ProviderAdapterRegistryShape {
  readonly getByInstance?: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderAdapterShape<ProviderAdapterError>, ProviderUnsupportedError>;

  readonly getInstanceInfo?: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderInstanceRoutingInfo, ProviderUnsupportedError>;

  readonly listInstances?: () => Effect.Effect<ReadonlyArray<ProviderInstanceId>>;

  /**
   * Resolve the adapter for a provider kind.
   *
   * @deprecated Prefer getByInstance.
   */
  readonly getByProvider: (
    provider: ProviderKind,
  ) => Effect.Effect<ProviderAdapterShape<ProviderAdapterError>, ProviderUnsupportedError>;

  /**
   * List provider kinds currently registered.
   *
   * @deprecated Prefer listInstances.
   */
  readonly listProviders: () => Effect.Effect<ReadonlyArray<ProviderKind>>;

  readonly streamChanges?: Stream.Stream<void>;
  readonly subscribeChanges?: Effect.Effect<PubSub.Subscription<void>, never, Scope.Scope>;
}

/**
 * ProviderAdapterRegistry - Service tag for provider adapter lookup.
 */
export class ProviderAdapterRegistry extends ServiceMap.Service<
  ProviderAdapterRegistry,
  ProviderAdapterRegistryShape
>()("t3/provider/Services/ProviderAdapterRegistry") {}

// Dummy comment for workflow testing.

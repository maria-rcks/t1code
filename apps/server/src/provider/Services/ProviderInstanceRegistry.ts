import type { ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type * as Effect from "effect/Effect";
import type * as PubSub from "effect/PubSub";
import type * as Scope from "effect/Scope";
import type * as Stream from "effect/Stream";

import type { ProviderInstance } from "../ProviderDriver.ts";

export interface ProviderInstanceRegistryShape {
  readonly getInstance: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderInstance | undefined>;
  readonly listInstances: Effect.Effect<ReadonlyArray<ProviderInstance>>;
  readonly listUnavailable: Effect.Effect<ReadonlyArray<ServerProvider>>;
  readonly streamChanges: Stream.Stream<void>;
  readonly subscribeChanges: Effect.Effect<PubSub.Subscription<void>, never, Scope.Scope>;
}

export class ProviderInstanceRegistry extends ServiceMap.Service<
  ProviderInstanceRegistry,
  ProviderInstanceRegistryShape
>()("t3/provider/Services/ProviderInstanceRegistry") {}

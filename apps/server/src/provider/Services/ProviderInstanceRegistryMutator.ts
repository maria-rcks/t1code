import type { ProviderInstanceConfigMap } from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type * as Effect from "effect/Effect";

export interface ProviderInstanceRegistryMutatorShape {
  readonly reconcile: (configMap: ProviderInstanceConfigMap) => Effect.Effect<void>;
}

export class ProviderInstanceRegistryMutator extends ServiceMap.Service<
  ProviderInstanceRegistryMutator,
  ProviderInstanceRegistryMutatorShape
>()("t3/provider/Services/ProviderInstanceRegistryMutator") {}

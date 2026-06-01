/**
 * ProviderHealth - Provider readiness snapshot service.
 *
 * Owns provider health checks (install/auth reachability) and exposes the
 * latest results to transport layers.
 *
 * @module ProviderHealth
 */
import type { ServerProviderStatus } from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface ProviderHealthShape {
  /**
   * Read the latest provider health statuses.
   */
  readonly getStatuses: Effect.Effect<ReadonlyArray<ServerProviderStatus>>;
}

export class ProviderHealth extends Context.Service<ProviderHealth, ProviderHealthShape>()(
  "t3/provider/Services/ProviderHealth",
) {}

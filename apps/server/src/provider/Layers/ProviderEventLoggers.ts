import { Effect, Layer, ServiceMap } from "effect";

import { ServerConfig } from "../../config";
import { type EventNdjsonLogger, makeEventNdjsonLogger } from "./EventNdjsonLogger";

export interface ProviderEventLoggersShape {
  readonly native: EventNdjsonLogger | undefined;
  readonly canonical: EventNdjsonLogger | undefined;
}

export class ProviderEventLoggers extends ServiceMap.Service<
  ProviderEventLoggers,
  ProviderEventLoggersShape
>()("t3/provider/Layers/ProviderEventLoggers") {}

export const NoOpProviderEventLoggers: ProviderEventLoggersShape = {
  native: undefined,
  canonical: undefined,
};

export const ProviderEventLoggersLive = Layer.effect(
  ProviderEventLoggers,
  Effect.gen(function* () {
    const { providerEventLogPath } = yield* ServerConfig;
    const native = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "native",
    });
    const canonical = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "canonical",
    });
    return {
      native,
      canonical,
    } satisfies ProviderEventLoggersShape;
  }),
);

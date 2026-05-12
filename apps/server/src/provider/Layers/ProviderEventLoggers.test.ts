import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { ServerConfig } from "../../config";
import {
  NoOpProviderEventLoggers,
  ProviderEventLoggers,
  ProviderEventLoggersLive,
} from "./ProviderEventLoggers";

const makeLayer = () =>
  ProviderEventLoggersLive.pipe(
    Layer.provideMerge(
      Layer.fresh(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-provider-event-loggers-test-",
        }),
      ),
    ),
  );

it.layer(NodeServices.layer)("ProviderEventLoggersLive", (it) => {
  it.effect("creates shared native and canonical loggers", () =>
    Effect.gen(function* () {
      const loggers = yield* ProviderEventLoggers;

      assert.notEqual(loggers.native, undefined);
      assert.notEqual(loggers.canonical, undefined);
      if (!loggers.native || !loggers.canonical) {
        return;
      }

      yield* loggers.native.close();
      yield* loggers.canonical.close();
    }).pipe(Effect.provide(makeLayer())),
  );

  it.effect("exposes a no-op logger pair for tests", () =>
    Effect.sync(() => {
      assert.deepEqual(NoOpProviderEventLoggers, {
        native: undefined,
        canonical: undefined,
      });
    }),
  );
});

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { ServerConfig } from "../../config";
import { ServerSecretStore } from "../Services/ServerSecretStore";
import { ServerSecretStoreLive } from "./ServerSecretStore";

const makeServerConfigLayer = () =>
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-secret-store-test-" });

const makeServerSecretStoreLayer = () =>
  ServerSecretStoreLive.pipe(Layer.provide(makeServerConfigLayer()));

it.layer(NodeServices.layer)("ServerSecretStoreLive", (it) => {
  it.effect("returns null when a secret file does not exist", () =>
    Effect.gen(function* () {
      const secretStore = yield* ServerSecretStore;

      const secret = yield* secretStore.get("missing-secret");

      assert.strictEqual(secret, null);
    }).pipe(Effect.provide(makeServerSecretStoreLayer())),
  );

  it.effect("persists and reuses an existing random secret", () =>
    Effect.gen(function* () {
      const secretStore = yield* ServerSecretStore;

      const first = yield* secretStore.getOrCreateRandom("session-signing-key", 32);
      const second = yield* secretStore.getOrCreateRandom("session-signing-key", 32);
      const persisted = yield* secretStore.get("session-signing-key");

      assert.deepStrictEqual(Array.from(second), Array.from(first));
      assert.deepStrictEqual(Array.from(persisted ?? new Uint8Array()), Array.from(first));
    }).pipe(Effect.provide(makeServerSecretStoreLayer())),
  );

  it.effect("removes stored secrets", () =>
    Effect.gen(function* () {
      const secretStore = yield* ServerSecretStore;

      yield* secretStore.set("api-key", Uint8Array.from([1, 2, 3]));
      yield* secretStore.remove("api-key");

      const secret = yield* secretStore.get("api-key");
      assert.strictEqual(secret, null);
    }).pipe(Effect.provide(makeServerSecretStoreLayer())),
  );
});

import { ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { buildUnavailableProviderSnapshot } from "./unavailableProviderSnapshot.ts";

const decodeProviderInstanceId = Schema.decodeUnknownSync(ProviderInstanceId);

describe("buildUnavailableProviderSnapshot", () => {
  it("creates a disabled unavailable provider shadow snapshot", async () => {
    const snapshot = await Effect.runPromise(
      buildUnavailableProviderSnapshot({
        driverKind: "ghostDriver",
        instanceId: decodeProviderInstanceId("ghostDriver"),
        displayName: "Ghost Driver",
        accentColor: "#ff00aa",
        reason: "Provider driver is not available in this build.",
        checkedAt: "2026-04-10T00:00:00.000Z",
      }),
    );

    expect(snapshot).toMatchObject({
      instanceId: "ghostDriver",
      driver: "ghostDriver",
      displayName: "Ghost Driver",
      accentColor: "#ff00aa",
      enabled: false,
      installed: false,
      status: "disabled",
      auth: { status: "unknown" },
      availability: "unavailable",
      unavailableReason: "Provider driver is not available in this build.",
      message: "Provider driver is not available in this build.",
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
      skills: [],
    });
  });
});

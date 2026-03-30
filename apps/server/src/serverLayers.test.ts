import { describe, expect, it } from "vitest";

import { resolveRuntimePtyAdapterRuntime } from "./serverLayers";

describe("resolveRuntimePtyAdapterRuntime", () => {
  it("uses the Node PTY adapter on Windows even when running under Bun", () => {
    expect(
      resolveRuntimePtyAdapterRuntime({
        platform: "win32",
        bunVersion: "1.3.9",
      }),
    ).toBe("node");
  });

  it("uses the Bun PTY adapter on non-Windows Bun runtimes", () => {
    expect(
      resolveRuntimePtyAdapterRuntime({
        platform: "linux",
        bunVersion: "1.3.9",
      }),
    ).toBe("bun");
  });

  it("uses the Node PTY adapter when Bun is not the runtime", () => {
    expect(
      resolveRuntimePtyAdapterRuntime({
        platform: "linux",
      }),
    ).toBe("node");
  });
});

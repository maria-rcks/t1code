import { afterEach, describe, expect, it, vi } from "vitest";

async function loadViteConfig() {
  vi.resetModules();
  const mod = await import("./vite.config");
  return mod.default;
}

describe("vite config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses package version and an empty hosted channel by default", async () => {
    vi.stubEnv("APP_VERSION", "");
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "");

    const config = await loadViteConfig();

    expect(config.define?.["import.meta.env.APP_VERSION"]).toBe(JSON.stringify("0.0.21"));
    expect(config.define?.["import.meta.env.VITE_HOSTED_APP_CHANNEL"]).toBe(JSON.stringify(""));
  });

  it("forwards release version and hosted channel env values", async () => {
    vi.stubEnv("APP_VERSION", "1.2.3");
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "nightly");

    const config = await loadViteConfig();

    expect(config.define?.["import.meta.env.APP_VERSION"]).toBe(JSON.stringify("1.2.3"));
    expect(config.define?.["import.meta.env.VITE_HOSTED_APP_CHANNEL"]).toBe(
      JSON.stringify("nightly"),
    );
  });
});

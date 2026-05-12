import { afterEach, describe, expect, it, vi } from "vitest";

async function importBranding() {
  vi.resetModules();
  return await import("./branding");
}

describe("branding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the default development stage without a hosted channel", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "");

    const branding = await importBranding();

    expect(branding.HOSTED_APP_CHANNEL).toBeNull();
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBeNull();
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Dev)");
  });

  it("uses nightly hosted channel branding", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "nightly");

    const branding = await importBranding();

    expect(branding.HOSTED_APP_CHANNEL).toBe("nightly");
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBe("Nightly");
    expect(branding.APP_STAGE_LABEL).toBe("Nightly");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Nightly)");
  });

  it("uses latest hosted channel branding", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", " LATEST ");

    const branding = await importBranding();

    expect(branding.HOSTED_APP_CHANNEL).toBe("latest");
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBe("Latest");
    expect(branding.APP_STAGE_LABEL).toBe("Latest");
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Latest)");
  });

  it("ignores unknown hosted channels", async () => {
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "preview");

    const branding = await importBranding();

    expect(branding.HOSTED_APP_CHANNEL).toBeNull();
    expect(branding.HOSTED_APP_CHANNEL_LABEL).toBeNull();
    expect(branding.APP_DISPLAY_NAME).toBe("T3 Code (Dev)");
  });
});

import { describe, expect, it } from "vitest";

import { TUI_SIDEBAR_WIDTH, resolveTuiResponsiveLayout } from "./responsiveLayout";

describe("resolveTuiResponsiveLayout", () => {
  it("keeps the full layout in wide terminals", () => {
    expect(
      resolveTuiResponsiveLayout({
        viewportColumns: 160,
        sidebarCollapsedPreference: false,
      }),
    ).toEqual(
      expect.objectContaining({
        showSidebarToggle: false,
        sidebarForcedCollapsed: false,
        sidebarCollapsed: false,
        sidebarWidth: TUI_SIDEBAR_WIDTH,
        showSidebar: true,
        showWindowDots: true,
        showSidebarAlphaBadge: true,
        sidebarTitle: "T1 Code",
        showHeaderProjectBadge: true,
        showComposerModeLabels: true,
        showComposerModelLabel: true,
        showComposerTraitsLabel: true,
        showComposerDividers: true,
      }),
    );
  });

  it("allows manual sidebar collapse before forcing it", () => {
    expect(
      resolveTuiResponsiveLayout({
        viewportColumns: 106,
        sidebarCollapsedPreference: true,
      }),
    ).toEqual(
      expect.objectContaining({
        showSidebarToggle: true,
        sidebarForcedCollapsed: false,
        sidebarCollapsed: true,
        sidebarWidth: 0,
        showSidebar: false,
        showWindowDots: false,
        showSidebarAlphaBadge: false,
        sidebarTitle: "T1",
        showHeaderProjectBadge: false,
        showComposerModeLabels: true,
        showComposerModelLabel: true,
        showComposerTraitsLabel: true,
        showComposerDividers: true,
      }),
    );
  });

  it("forces the sidebar closed in very narrow terminals", () => {
    expect(
      resolveTuiResponsiveLayout({
        viewportColumns: 86,
        sidebarCollapsedPreference: false,
      }),
    ).toEqual(
      expect.objectContaining({
        showSidebarToggle: true,
        sidebarForcedCollapsed: true,
        sidebarCollapsed: true,
        sidebarWidth: 0,
        showSidebar: false,
        showComposerModeLabels: true,
        showComposerModelLabel: true,
        showComposerTraitsLabel: true,
      }),
    );
  });

  it("keeps footer labels visible while the sidebar is still open", () => {
    expect(
      resolveTuiResponsiveLayout({
        viewportColumns: 110,
        sidebarCollapsedPreference: false,
      }),
    ).toEqual(
      expect.objectContaining({
        showSidebar: true,
        showComposerModeLabels: true,
        showComposerModelLabel: true,
        showComposerTraitsLabel: false,
        showComposerDividers: true,
      }),
    );
  });

  it("keeps the sidebar open until the main pane is actually constrained", () => {
    expect(
      resolveTuiResponsiveLayout({
        viewportColumns: 104,
        sidebarCollapsedPreference: false,
      }),
    ).toEqual(
      expect.objectContaining({
        showSidebarToggle: false,
        sidebarForcedCollapsed: false,
        sidebarCollapsed: false,
        showSidebar: true,
      }),
    );
  });
});

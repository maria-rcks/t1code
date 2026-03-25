export const TUI_SIDEBAR_WIDTH = 34;

const SIDEBAR_TOGGLE_MAX_MAIN_COLUMNS = 64;
const SIDEBAR_FORCE_COLLAPSE_MAX_MAIN_COLUMNS = 52;
const COMPACT_HEADER_MAX_COLUMNS = 132;
const COMPOSER_MODE_LABEL_MIN_MAIN_COLUMNS = 44;
const COMPOSER_MODEL_LABEL_MIN_MAIN_COLUMNS = 62;
const COMPOSER_TRAITS_LABEL_MIN_MAIN_COLUMNS = 82;

export type TuiResponsiveLayout = Readonly<{
  showSidebarToggle: boolean;
  sidebarForcedCollapsed: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  showSidebar: boolean;
  showWindowDots: boolean;
  showSidebarAlphaBadge: boolean;
  sidebarTitle: string;
  showHeaderProjectBadge: boolean;
  showComposerModeLabels: boolean;
  showComposerModelLabel: boolean;
  showComposerTraitsLabel: boolean;
  showComposerDividers: boolean;
}>;

export function resolveTuiResponsiveLayout(input: {
  viewportColumns: number;
  sidebarCollapsedPreference: boolean;
}): TuiResponsiveLayout {
  const openSidebarMainPanelColumns = input.viewportColumns - TUI_SIDEBAR_WIDTH - 1;
  const showSidebarToggle =
    openSidebarMainPanelColumns <= SIDEBAR_TOGGLE_MAX_MAIN_COLUMNS ||
    input.sidebarCollapsedPreference;
  const sidebarForcedCollapsed =
    openSidebarMainPanelColumns <= SIDEBAR_FORCE_COLLAPSE_MAX_MAIN_COLUMNS;
  const sidebarCollapsed =
    sidebarForcedCollapsed || (showSidebarToggle && input.sidebarCollapsedPreference);
  const mainPanelColumns =
    input.viewportColumns - (sidebarCollapsed ? 0 : TUI_SIDEBAR_WIDTH) - (sidebarCollapsed ? 0 : 1);
  const showComposerModeLabels = mainPanelColumns >= COMPOSER_MODE_LABEL_MIN_MAIN_COLUMNS;
  const showComposerModelLabel = mainPanelColumns >= COMPOSER_MODEL_LABEL_MIN_MAIN_COLUMNS;
  const showComposerTraitsLabel = mainPanelColumns >= COMPOSER_TRAITS_LABEL_MIN_MAIN_COLUMNS;

  return {
    showSidebarToggle,
    sidebarForcedCollapsed,
    sidebarCollapsed,
    sidebarWidth: sidebarCollapsed ? 0 : TUI_SIDEBAR_WIDTH,
    showSidebar: !sidebarCollapsed,
    showWindowDots: input.viewportColumns >= COMPACT_HEADER_MAX_COLUMNS,
    showSidebarAlphaBadge: !sidebarCollapsed,
    sidebarTitle: input.viewportColumns >= COMPACT_HEADER_MAX_COLUMNS ? "T1 Code" : "T1",
    showHeaderProjectBadge: input.viewportColumns >= 144,
    showComposerModeLabels,
    showComposerModelLabel,
    showComposerTraitsLabel,
    showComposerDividers:
      showComposerModeLabels || showComposerModelLabel || showComposerTraitsLabel,
  };
}

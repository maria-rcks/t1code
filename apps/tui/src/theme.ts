import type { AppTheme } from "@t3tools/client-core";

export interface TerminalColors {
  readonly palette: readonly (string | null)[];
  readonly defaultForeground: string | null;
  readonly defaultBackground: string | null;
  readonly cursorColor: string | null;
  readonly mouseForeground: string | null;
  readonly mouseBackground: string | null;
  readonly tekForeground: string | null;
  readonly tekBackground: string | null;
  readonly highlightBackground: string | null;
  readonly highlightForeground: string | null;
}

export type TuiColor = string;

export const TERMINAL_MATCH_THEME_ID = "terminal-match" as const;
export const TUI_THEME_IDS = ["default", TERMINAL_MATCH_THEME_ID] as const;
export type TuiThemeId = (typeof TUI_THEME_IDS)[number];
export const DEFAULT_TUI_THEME_ID = "default" as const;
export const TUI_THEME_LABELS: Record<TuiThemeId, string> = {
  default: "Default",
  [TERMINAL_MATCH_THEME_ID]: "Terminal Match",
};

export type TuiThemeMode = "light" | "dark";

type TuiThemeDetails = {
  attachmentPillTones: readonly { backgroundColor: TuiColor; textColor: TuiColor }[];
  codeBlock: { background: TuiColor; language: TuiColor; copyIcon: TuiColor };
  status: { awaitingInput: TuiColor; working: TuiColor; planReady: TuiColor; pulse: TuiColor };
  diffViewer: {
    addedBg: TuiColor;
    removedBg: TuiColor;
    addedContentBg: TuiColor;
    removedContentBg: TuiColor;
    addedSignColor: TuiColor;
    removedSignColor: TuiColor;
  };
  colors: {
    workEntryErrorAccent: TuiColor;
    destructiveIcon: TuiColor;
    controlKnob: TuiColor;
    primaryButtonText: TuiColor;
    sendDotIdle: TuiColor;
    sendDotActive: TuiColor;
    selectedText: TuiColor;
  };
};

export interface ResolveTuiThemeOptions {
  systemMode?: TuiThemeMode | null;
  terminalColors?: TerminalColors | null;
}

const DEFAULT_DARK_PALETTE = {
  canvas: "#21141e",
  sidebar: "#1a0f18",
  main: "#21141e",
  surface: "#2a1825",
  surfaceAlt: "#311e2c",
  input: "#1a0f18",
  surfaceUser: "#2a1825",
  surfacePlan: "#1f221c",
  surfaceWarn: "#262016",
  surfaceInfo: "#261a2e",
  footer: "#21141e",
  diff: "#2a1825",
  popup: "#2a1825",
  scrim: "#00000099",
  border: "#3d2438",
  divider: "#3d2438",
  control: "transparent",
  controlHover: "#311e2c",
  controlActive: "#3d2438",
  controlActiveStrong: "#2a1825",
  controlInset: "#1a0f18",
  controlInsetHover: "#21141e",
  composerPanel: "#2a1825",
  composerBorder: "#a3004c",
  composerBorderMuted: "#3d2438",
  composerSend: "#a3004c",
  composerSendHover: "#e33f86",
  composerStop: "#dc2626",
  composerStopHover: "#ef4444",
  accent: "#e33f86",
  cursor: "#d4d4d4",
  selection: "#5c1a3e",
  selectionActive: "#7a2450",
  text: "#f9f8fb",
  muted: "#b89eb5",
  subtle: "#8a6b87",
  success: "#10b981",
  info: "#c074b2",
  warning: "#f59e0b",
  claude: "#d97757",
  macRed: "#ff5f57",
  macYellow: "#febc2e",
  macGreen: "#28c840",
} satisfies Record<string, TuiColor>;

type TuiPaletteShape = typeof DEFAULT_DARK_PALETTE;
export type TuiPalette = { [Key in keyof TuiPaletteShape]: TuiColor };

const DEFAULT_THEME_DETAILS = {
  attachmentPillTones: [
    { backgroundColor: "#2e1528", textColor: "#e33f86" },
    { backgroundColor: "#241b2f", textColor: "#c074b2" },
    { backgroundColor: "#2a2417", textColor: "#facc15" },
    { backgroundColor: "#2a1b1b", textColor: "#f87171" },
    { backgroundColor: "#1c2721", textColor: "#34d399" },
    { backgroundColor: "#272019", textColor: "#fb923c" },
  ],
  codeBlock: {
    background: "#1a0f18",
    language: "#8a6b87",
    copyIcon: "#b89eb5",
  },
  status: {
    awaitingInput: "#e33f86",
    working: "#c074b2",
    planReady: "#a78bfa",
    pulse: "#e33f86",
  },
  diffViewer: {
    addedBg: "#173124",
    removedBg: "#3a1f1f",
    addedContentBg: "#1d3a2b",
    removedContentBg: "#442525",
    addedSignColor: "#4ade80",
    removedSignColor: "#f87171",
  },
  colors: {
    workEntryErrorAccent: "#fda4af",
    destructiveIcon: "#fda4af",
    controlKnob: "#f5f5f5",
    primaryButtonText: "#f5f5f5",
    sendDotIdle: "#6b7280",
    sendDotActive: "#d1d5db",
    selectedText: "#f5f5f5",
  },
} satisfies TuiThemeDetails;

export type TuiTheme = {
  id: TuiThemeId;
  mode: TuiThemeMode;
  palette: TuiPalette;
} & TuiThemeDetails;

const DEFAULT_DARK_THEME: TuiTheme = {
  id: "default",
  mode: "dark",
  palette: DEFAULT_DARK_PALETTE,
  ...DEFAULT_THEME_DETAILS,
};

const DEFAULT_LIGHT_PALETTE: TuiPalette = {
  ...DEFAULT_DARK_PALETTE,
  canvas: "#f2e1f4",
  sidebar: "#ead0ef",
  main: "#fdf7fd",
  surface: "#ffffff",
  surfaceAlt: "#f5eaf6",
  input: "#ffffff",
  surfaceUser: "#f0ddf2",
  surfacePlan: "#eef6ec",
  surfaceWarn: "#fff5e6",
  surfaceInfo: "#f5eaff",
  footer: "#fdf7fd",
  diff: "#fafafa",
  popup: "#ffffff",
  scrim: "#00000022",
  border: "#efbdeb",
  divider: "#e0b8dc",
  controlHover: "#f0ddf2",
  controlActive: "#e6cce9",
  controlActiveStrong: "#d9b8dd",
  controlInset: "#ead0ef",
  controlInsetHover: "#e0c2e4",
  composerPanel: "#ffffff",
  composerBorder: "#e33f86",
  composerBorderMuted: "#e0b8dc",
  composerSend: "#e33f86",
  composerSendHover: "#ca0277",
  accent: "#ca0277",
  cursor: "#a3a3a3",
  selection: "#f5d0e8",
  selectionActive: "#f0b8dd",
  text: "#501854",
  muted: "#7a3f7e",
  subtle: "#9a6b9e",
  success: "#059669",
  info: "#8b3fa0",
  warning: "#d97706",
  claude: "#c96d4d",
};

const DEFAULT_LIGHT_THEME: TuiTheme = {
  ...DEFAULT_DARK_THEME,
  id: "default",
  mode: "light",
  palette: DEFAULT_LIGHT_PALETTE,
  colors: {
    ...DEFAULT_DARK_THEME.colors,
    selectedText: "#171717",
  },
};

export const DEFAULT_TUI_THEME = DEFAULT_DARK_THEME;

function defaultThemeForMode(mode: TuiThemeMode): TuiTheme {
  return mode === "light" ? DEFAULT_LIGHT_THEME : DEFAULT_DARK_THEME;
}

type RgbaColor = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
};

interface SystemThemeCurrent {
  readonly primary: RgbaColor;
  readonly secondary: RgbaColor;
  readonly accent: RgbaColor;
  readonly error: RgbaColor;
  readonly warning: RgbaColor;
  readonly success: RgbaColor;
  readonly info: RgbaColor;
  readonly text: RgbaColor;
  readonly textMuted: RgbaColor;
  readonly selectedListItemText: RgbaColor;
  readonly background: RgbaColor;
  readonly backgroundPanel: RgbaColor;
  readonly backgroundElement: RgbaColor;
  readonly backgroundMenu: RgbaColor;
  readonly border: RgbaColor;
  readonly borderActive: RgbaColor;
  readonly borderSubtle: RgbaColor;
  readonly diffHighlightAdded: RgbaColor;
  readonly diffHighlightRemoved: RgbaColor;
  readonly diffAddedBg: RgbaColor;
  readonly diffRemovedBg: RgbaColor;
  readonly diffAddedLineNumberBg: RgbaColor;
  readonly diffRemovedLineNumberBg: RgbaColor;
}

type SystemTheme = SystemThemeCurrent & {
  _hasSelectedListItemText: boolean;
};

type SystemThemeColor = keyof SystemThemeCurrent;
type HexColor = `#${string}`;
type RefName = string;
type Variant = {
  dark: HexColor | RefName;
  light: HexColor | RefName;
};
type ColorValue = HexColor | RefName | Variant | RgbaColor | number;

type ThemeJson = {
  defs?: Record<string, HexColor | RefName>;
  theme: Omit<Record<SystemThemeColor, ColorValue>, "selectedListItemText" | "backgroundMenu"> & {
    selectedListItemText?: ColorValue;
    backgroundMenu?: ColorValue;
  };
};

const ANSI_COLOR_FALLBACKS = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
] as const;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isRgbaColor(value: unknown): value is RgbaColor {
  return (
    typeof value === "object" &&
    value !== null &&
    "r" in value &&
    "g" in value &&
    "b" in value &&
    "a" in value
  );
}

function fromInts(r: number, g: number, b: number, a = 255): RgbaColor {
  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
    a: clampByte(a),
  };
}

function rgbaFromHex(hex: string): RgbaColor {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3 || normalized.length === 4
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;

  if (expanded.length !== 6 && expanded.length !== 8) {
    throw new Error(`Unsupported color format: ${hex}`);
  }

  return fromInts(
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255,
  );
}

function formatHexChannel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function rgbaToHex(color: RgbaColor): TuiColor {
  const base = `#${formatHexChannel(color.r)}${formatHexChannel(color.g)}${formatHexChannel(color.b)}`;
  return color.a === 255 ? base : `${base}${formatHexChannel(color.a)}`;
}

function luminanceFromColor(color: RgbaColor): number {
  return (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
}

function systemBackgroundHex(colors: TerminalColors): string | null {
  return colors.defaultBackground ?? colors.palette[0] ?? null;
}

function systemForegroundHex(colors: TerminalColors): string | null {
  return colors.defaultForeground ?? colors.palette[7] ?? null;
}

export function isTuiThemeId(value: unknown): value is TuiThemeId {
  return typeof value === "string" && (TUI_THEME_IDS as readonly string[]).includes(value);
}

export function normalizeTuiThemeId(value: unknown): TuiThemeId {
  return isTuiThemeId(value) ? value : DEFAULT_TUI_THEME_ID;
}

export function hasUsableTerminalColors(
  colors: TerminalColors | null | undefined,
): colors is TerminalColors {
  return Boolean(colors && systemBackgroundHex(colors) && systemForegroundHex(colors));
}

function luminanceFromHex(hex: string): number {
  return luminanceFromColor(rgbaFromHex(hex));
}

function ansiCubeComponent(value: number): number {
  return value === 0 ? 0 : value * 40 + 55;
}

function ansiToRgba(code: number): RgbaColor {
  if (code < 16) {
    return rgbaFromHex(ANSI_COLOR_FALLBACKS[code] ?? "#000000");
  }
  if (code < 232) {
    const index = code - 16;
    const b = index % 6;
    const g = Math.floor(index / 6) % 6;
    const r = Math.floor(index / 36);
    return fromInts(ansiCubeComponent(r), ansiCubeComponent(g), ansiCubeComponent(b));
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8;
    return fromInts(gray, gray, gray);
  }
  return fromInts(0, 0, 0);
}

function resolveSystemTheme(theme: ThemeJson, mode: TuiThemeMode): SystemTheme {
  const defs = theme.defs ?? {};

  function resolveColor(color: ColorValue, chain: string[] = []): RgbaColor {
    if (isRgbaColor(color)) return color;
    if (typeof color === "string") {
      if (color === "transparent" || color === "none") return fromInts(0, 0, 0, 0);
      if (color.startsWith("#")) return rgbaFromHex(color);
      if (chain.includes(color)) {
        throw new Error(`Circular color reference: ${[...chain, color].join(" -> ")}`);
      }
      const next = defs[color] ?? theme.theme[color as SystemThemeColor];
      if (next === undefined) {
        throw new Error(`Color reference "${color}" not found in defs or theme`);
      }
      return resolveColor(next, [...chain, color]);
    }
    if (typeof color === "number") {
      return ansiToRgba(color);
    }
    return resolveColor(color[mode], chain);
  }

  const resolved = Object.fromEntries(
    Object.entries(theme.theme)
      .filter(([key]) => key !== "selectedListItemText" && key !== "backgroundMenu")
      .map(([key, value]) => [key, resolveColor(value as ColorValue)]),
  ) as Partial<Record<SystemThemeColor, RgbaColor>>;

  const hasSelectedListItemText = theme.theme.selectedListItemText !== undefined;
  if (hasSelectedListItemText) {
    resolved.selectedListItemText = resolveColor(theme.theme.selectedListItemText!);
  } else {
    resolved.selectedListItemText = resolved.background!;
  }

  if (theme.theme.backgroundMenu !== undefined) {
    resolved.backgroundMenu = resolveColor(theme.theme.backgroundMenu);
  } else {
    resolved.backgroundMenu = resolved.backgroundElement!;
  }

  return {
    ...(resolved as SystemThemeCurrent),
    _hasSelectedListItemText: hasSelectedListItemText,
  };
}

function selectedForeground(theme: SystemTheme, bg?: RgbaColor): RgbaColor {
  if (theme._hasSelectedListItemText) {
    return theme.selectedListItemText;
  }
  if (theme.background.a === 0) {
    return luminanceFromColor(bg ?? theme.primary) > 0.5
      ? fromInts(0, 0, 0)
      : fromInts(255, 255, 255);
  }
  return theme.background;
}

function tint(base: RgbaColor, overlay: RgbaColor, alpha: number): RgbaColor {
  return fromInts(
    base.r + (overlay.r - base.r) * alpha,
    base.g + (overlay.g - base.g) * alpha,
    base.b + (overlay.b - base.b) * alpha,
    base.a,
  );
}

function scaleChannels(bg: RgbaColor, luminance: number, nextLum: number): RgbaColor {
  if (luminance === 0) {
    return bg;
  }

  const ratio = nextLum / luminance;
  return fromInts(bg.r * ratio, bg.g * ratio, bg.b * ratio, bg.a);
}

function generateGrayScale(bg: RgbaColor, isDark: boolean): Record<number, RgbaColor> {
  const grays: Record<number, RgbaColor> = {};
  const luminance = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;

  for (let index = 1; index <= 12; index++) {
    const factor = index / 12;
    let nextColor: RgbaColor;

    if (isDark) {
      if (luminance < 10) {
        const gray = factor * 0.4 * 255;
        nextColor = fromInts(gray, gray, gray);
      } else {
        const nextLum = luminance + (255 - luminance) * factor * 0.4;
        nextColor = scaleChannels(bg, luminance, nextLum);
      }
    } else if (luminance > 245) {
      const gray = 255 - factor * 0.4 * 255;
      nextColor = fromInts(gray, gray, gray);
    } else {
      const nextLum = luminance * (1 - factor * 0.4);
      nextColor = scaleChannels(bg, luminance, nextLum);
    }

    grays[index] = nextColor;
  }

  return grays;
}

function generateMutedTextColor(bg: RgbaColor, isDark: boolean): RgbaColor {
  const luminance = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  const gray = isDark
    ? luminance < 10
      ? 180
      : Math.min(Math.floor(160 + luminance * 0.3), 200)
    : luminance > 245
      ? 75
      : Math.max(Math.floor(100 - (255 - luminance) * 0.2), 60);
  return fromInts(gray, gray, gray);
}

function generateSystem(colors: TerminalColors, mode: TuiThemeMode): ThemeJson {
  const backgroundHex = systemBackgroundHex(colors);
  const foregroundHex = systemForegroundHex(colors);
  if (!backgroundHex || !foregroundHex) {
    throw new Error("Terminal palette is incomplete");
  }

  const bg = rgbaFromHex(backgroundHex);
  const fg = rgbaFromHex(foregroundHex);
  const transparent = fromInts(bg.r, bg.g, bg.b, 0);
  const isDark = mode === "dark";
  const grays = generateGrayScale(bg, isDark);
  const textMuted = generateMutedTextColor(bg, isDark);
  const gray = (index: number) => grays[index] ?? bg;
  const colorAt = (index: number) => {
    const value = colors.palette[index];
    return value ? rgbaFromHex(value) : ansiToRgba(index);
  };

  const ansi = {
    red: colorAt(1),
    green: colorAt(2),
    yellow: colorAt(3),
    blue: colorAt(4),
    magenta: colorAt(5),
    cyan: colorAt(6),
    redBright: colorAt(9),
    greenBright: colorAt(10),
  };

  const diffAlpha = isDark ? 0.22 : 0.14;
  return {
    theme: {
      primary: ansi.cyan,
      secondary: ansi.magenta,
      accent: ansi.cyan,
      error: ansi.red,
      warning: ansi.yellow,
      success: ansi.green,
      info: ansi.cyan,
      text: fg,
      textMuted,
      selectedListItemText: bg,
      background: transparent,
      backgroundPanel: gray(2),
      backgroundElement: gray(3),
      backgroundMenu: gray(3),
      borderSubtle: gray(6),
      border: gray(7),
      borderActive: gray(8),
      diffHighlightAdded: ansi.greenBright,
      diffHighlightRemoved: ansi.redBright,
      diffAddedBg: tint(bg, ansi.green, diffAlpha),
      diffRemovedBg: tint(bg, ansi.red, diffAlpha),
      diffAddedLineNumberBg: tint(gray(3), ansi.green, diffAlpha),
      diffRemovedLineNumberBg: tint(gray(3), ansi.red, diffAlpha),
    },
  };
}

export function resolveTerminalThemeMode(
  colors: TerminalColors | null | undefined,
): TuiThemeMode | null {
  if (!hasUsableTerminalColors(colors)) return null;
  return luminanceFromHex(systemBackgroundHex(colors)!) > 0.5 ? "light" : "dark";
}

function createTerminalMatchTheme(colors: TerminalColors, mode: TuiThemeMode): TuiTheme {
  const resolved = resolveSystemTheme(generateSystem(colors, mode), mode);
  const isDark = mode === "dark";
  const toneAlpha = isDark ? 0.18 : 0.12;
  const selectedText = selectedForeground(resolved, resolved.primary);

  return {
    id: TERMINAL_MATCH_THEME_ID,
    mode,
    palette: {
      canvas: rgbaToHex(resolved.background),
      sidebar: rgbaToHex(resolved.backgroundPanel),
      main: rgbaToHex(resolved.background),
      surface: rgbaToHex(resolved.backgroundPanel),
      surfaceAlt: rgbaToHex(resolved.backgroundElement),
      input: rgbaToHex(resolved.backgroundElement),
      surfaceUser: rgbaToHex(resolved.backgroundPanel),
      surfacePlan: rgbaToHex(
        tint(resolved.backgroundPanel, resolved.secondary, isDark ? 0.14 : 0.1),
      ),
      surfaceWarn: rgbaToHex(tint(resolved.backgroundPanel, resolved.warning, isDark ? 0.16 : 0.1)),
      surfaceInfo: rgbaToHex(tint(resolved.backgroundPanel, resolved.info, isDark ? 0.14 : 0.1)),
      footer: rgbaToHex(resolved.background),
      diff: rgbaToHex(resolved.backgroundPanel),
      popup: rgbaToHex(resolved.backgroundMenu),
      scrim: isDark ? "#00000099" : "#00000022",
      border: rgbaToHex(resolved.border),
      divider: rgbaToHex(resolved.borderSubtle),
      control: "transparent",
      controlHover: rgbaToHex(resolved.backgroundElement),
      controlActive: rgbaToHex(resolved.backgroundElement),
      controlActiveStrong: rgbaToHex(resolved.backgroundMenu),
      controlInset: rgbaToHex(resolved.backgroundPanel),
      controlInsetHover: rgbaToHex(resolved.backgroundElement),
      composerPanel: rgbaToHex(resolved.backgroundElement),
      composerBorder: rgbaToHex(resolved.primary),
      composerBorderMuted: rgbaToHex(resolved.borderSubtle),
      composerSend: rgbaToHex(resolved.primary),
      composerSendHover: rgbaToHex(resolved.accent),
      composerStop: rgbaToHex(resolved.error),
      composerStopHover: rgbaToHex(resolved.diffHighlightRemoved),
      accent: rgbaToHex(resolved.accent),
      cursor: rgbaToHex(resolved.text),
      selection: rgbaToHex(resolved.primary),
      selectionActive: rgbaToHex(resolved.accent),
      text: rgbaToHex(resolved.text),
      muted: rgbaToHex(resolved.textMuted),
      subtle: rgbaToHex(resolved.borderActive),
      success: rgbaToHex(resolved.success),
      info: rgbaToHex(resolved.info),
      warning: rgbaToHex(resolved.warning),
      claude: rgbaToHex(resolved.secondary),
      macRed: "#ff5f57",
      macYellow: "#febc2e",
      macGreen: "#28c840",
    },
    attachmentPillTones: [
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.primary, toneAlpha)),
        textColor: rgbaToHex(resolved.primary),
      },
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.secondary, toneAlpha)),
        textColor: rgbaToHex(resolved.secondary),
      },
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.warning, toneAlpha)),
        textColor: rgbaToHex(resolved.warning),
      },
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.error, toneAlpha)),
        textColor: rgbaToHex(resolved.error),
      },
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.success, toneAlpha)),
        textColor: rgbaToHex(resolved.success),
      },
      {
        backgroundColor: rgbaToHex(tint(resolved.backgroundElement, resolved.info, toneAlpha)),
        textColor: rgbaToHex(resolved.info),
      },
    ],
    codeBlock: {
      background: rgbaToHex(resolved.backgroundElement),
      language: rgbaToHex(resolved.textMuted),
      copyIcon: rgbaToHex(resolved.textMuted),
    },
    status: {
      awaitingInput: rgbaToHex(resolved.primary),
      working: rgbaToHex(resolved.info),
      planReady: rgbaToHex(resolved.secondary),
      pulse: rgbaToHex(resolved.accent),
    },
    diffViewer: {
      addedBg: rgbaToHex(resolved.diffAddedLineNumberBg),
      removedBg: rgbaToHex(resolved.diffRemovedLineNumberBg),
      addedContentBg: rgbaToHex(resolved.diffAddedBg),
      removedContentBg: rgbaToHex(resolved.diffRemovedBg),
      addedSignColor: rgbaToHex(resolved.diffHighlightAdded),
      removedSignColor: rgbaToHex(resolved.diffHighlightRemoved),
    },
    colors: {
      workEntryErrorAccent: rgbaToHex(resolved.diffHighlightRemoved),
      destructiveIcon: rgbaToHex(resolved.error),
      controlKnob: rgbaToHex(selectedText),
      primaryButtonText: rgbaToHex(selectedText),
      sendDotIdle: rgbaToHex(resolved.textMuted),
      sendDotActive: rgbaToHex(selectedText),
      selectedText: rgbaToHex(selectedText),
    },
  };
}

function terminalColorsSignature(colors: TerminalColors | null | undefined): string {
  if (!colors) return "none";
  return [
    colors.defaultBackground ?? "",
    colors.defaultForeground ?? "",
    ...colors.palette.map((value) => value ?? ""),
  ].join("|");
}

export function resolveTuiThemeMode(
  theme: AppTheme | undefined,
  systemMode: TuiThemeMode | null = null,
): TuiThemeMode {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return systemMode ?? "dark";
}

const THEME_CACHE = new Map<string, TuiTheme>([
  [`${DEFAULT_TUI_THEME_ID}:dark`, DEFAULT_DARK_THEME],
  [`${DEFAULT_TUI_THEME_ID}:light`, DEFAULT_LIGHT_THEME],
]);

export function resolveTuiTheme(
  theme: AppTheme | undefined,
  themeId: TuiThemeId = DEFAULT_TUI_THEME_ID,
  options: ResolveTuiThemeOptions = {},
): TuiTheme {
  const mode = resolveTuiThemeMode(theme, options.systemMode ?? null);
  const cacheKey =
    themeId === TERMINAL_MATCH_THEME_ID
      ? `${themeId}:${mode}:${terminalColorsSignature(options.terminalColors)}`
      : `${themeId}:${mode}`;
  const cached = THEME_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (themeId === TERMINAL_MATCH_THEME_ID) {
    const fallback = defaultThemeForMode(mode);
    if (!hasUsableTerminalColors(options.terminalColors)) {
      THEME_CACHE.set(cacheKey, fallback);
      return fallback;
    }

    const resolved = createTerminalMatchTheme(options.terminalColors, mode);
    THEME_CACHE.set(cacheKey, resolved);
    return resolved;
  }

  return defaultThemeForMode(mode);
}

export function colorToHex(color: TuiColor): string {
  return color;
}

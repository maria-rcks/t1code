export type KeybindingGuideItem = {
  readonly shortcut: string;
  readonly action: string;
  readonly note?: string;
};

export type KeybindingGuideSection = {
  readonly title: string;
  readonly items: readonly KeybindingGuideItem[];
};

export function shouldPreferTerminalShortcutFallbacks(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.WT_SESSION);
}

export function resolveTerminalToggleShortcutLabel(preferFallbacks: boolean): string {
  return preferFallbacks ? "Ctrl+T" : "Ctrl+J";
}

export function resolveComposerNewlineShortcutLabel(preferFallbacks: boolean): string {
  return preferFallbacks ? "Ctrl+O" : "Shift+Enter";
}

export function resolveKeybindingGuideSections(
  preferTerminalShortcutFallbacks: boolean,
): readonly KeybindingGuideSection[] {
  const terminalToggleShortcut = resolveTerminalToggleShortcutLabel(
    preferTerminalShortcutFallbacks,
  );
  const composerNewlineShortcut = resolveComposerNewlineShortcutLabel(
    preferTerminalShortcutFallbacks,
  );

  return [
    {
      title: "Global",
      items: [
        {
          shortcut: "Ctrl+C",
          action: "Open the quit prompt; press Ctrl+C again to confirm exit",
        },
        {
          shortcut: "Esc",
          action: "Close the active dialog, overlay, or image preview",
        },
        {
          shortcut: "Ctrl+C / Enter",
          action: "Confirm quit from the exit prompt",
        },
      ],
    },
    {
      title: "Projects and Threads",
      items: [
        {
          shortcut: "Ctrl+P",
          action: "Open the add-project prompt",
        },
        {
          shortcut: "Ctrl+N",
          action: "Create a new thread in the active project",
        },
        {
          shortcut: "Ctrl+B",
          action: "Toggle the sidebar when space is tight",
        },
        {
          shortcut: terminalToggleShortcut,
          action: "Toggle the terminal pane for the active thread",
          ...(preferTerminalShortcutFallbacks
            ? {
                note: "Windows Terminal does not expose Ctrl+J distinctly here.",
              }
            : {}),
        },
        {
          shortcut: "↑ / ↓",
          action: "Move through projects or threads",
        },
        {
          shortcut: "← / →",
          action: "Collapse or expand projects, or move focus between panes",
        },
        {
          shortcut: "Enter",
          action: "Open the focused project or thread action",
        },
        {
          shortcut: "Shift+↑ / Shift+↓",
          action: "Extend thread selection",
        },
        {
          shortcut: "Delete / Backspace",
          action: "Delete the focused thread selection",
          note: "Only works while the thread list is focused.",
        },
      ],
    },
    {
      title: "Composer",
      items: [
        {
          shortcut: "Enter",
          action: "Send the current message",
        },
        {
          shortcut: composerNewlineShortcut,
          action: "Insert a newline",
          ...(preferTerminalShortcutFallbacks
            ? {
                note: "Windows Terminal collapses Shift+Enter into Enter here.",
              }
            : {}),
        },
        {
          shortcut: "Ctrl+C",
          action: "Clear the current draft",
        },
        {
          shortcut: "Delete twice",
          action: "Remove the last attached image from an empty draft",
        },
      ],
    },
    {
      title: "Timeline and Diff",
      items: [
        {
          shortcut: "↑ / ↓ / PageUp / PageDown / Home / End / j / k",
          action: "Scroll the timeline",
        },
        {
          shortcut: "Ctrl+D",
          action: "Toggle the full diff view",
        },
        {
          shortcut: "v",
          action: "Toggle unified and split diff view",
          note: "Only while the diff view is focused.",
        },
      ],
    },
    {
      title: "Terminal",
      items: [
        {
          shortcut: "Click terminal pane",
          action: "Focus the terminal and send keyboard input to the shell",
        },
        {
          shortcut: terminalToggleShortcut,
          action: "Hide the terminal pane",
        },
      ],
    },
    {
      title: "Images",
      items: [
        {
          shortcut: "Click image chip",
          action: "Open the image preview overlay",
        },
        {
          shortcut: "Esc or click outside",
          action: "Close the image preview overlay",
        },
      ],
    },
  ] as const;
}

export function isCtrlC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
}): boolean {
  return input.ctrl === true && input.keyName === "c";
}

export function shouldClearComposerOnCtrlC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly composerFocused: boolean;
  readonly hasComposerText: boolean;
}): boolean {
  return isCtrlC(input) && input.composerFocused && input.hasComposerText;
}

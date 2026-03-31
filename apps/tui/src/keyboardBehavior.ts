export type KeybindingGuideItem = {
  readonly shortcut: string;
  readonly action: string;
  readonly note?: string;
};

export type KeybindingGuideSection = {
  readonly title: string;
  readonly items: readonly KeybindingGuideItem[];
};

export const KEYBINDING_GUIDE_SECTIONS: readonly KeybindingGuideSection[] = [
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
        shortcut: "Shift+Enter / Ctrl+J",
        action: "Insert a newline",
      },
      {
        shortcut: "Ctrl+C",
        action: "Clear the current draft",
      },
      {
        shortcut: "Ctrl+Shift+A",
        action: "Select all text in the composer",
      },
      {
        shortcut: "Ctrl+Shift+C",
        action: "Copy the current composer selection",
      },
      {
        shortcut: "Esc",
        action: "Stop the active turn",
        note: "Only when a turn is active and no dialog or overlay is open.",
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

export function isCtrlC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
}): boolean {
  return input.ctrl === true && input.keyName === "c";
}

export function isCtrlA(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
}): boolean {
  return input.ctrl === true && input.shift !== true && input.keyName === "a";
}

export function isCtrlShiftA(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
}): boolean {
  return input.ctrl === true && input.shift === true && input.keyName === "a";
}

export function isCtrlShiftC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
}): boolean {
  return input.ctrl === true && input.shift === true && input.keyName === "c";
}

export function shouldSelectAllComposerOnCtrlShiftA(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly composerFocused: boolean;
}): boolean {
  return isCtrlShiftA(input) && input.composerFocused;
}

export function shouldCopyComposerSelectionOnCtrlShiftC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly composerFocused: boolean;
  readonly hasSelection: boolean;
}): boolean {
  return isCtrlShiftC(input) && input.composerFocused && input.hasSelection;
}

export function shouldClearComposerOnCtrlC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly composerFocused: boolean;
  readonly hasComposerText: boolean;
}): boolean {
  return isCtrlC(input) && input.shift !== true && input.composerFocused && input.hasComposerText;
}

export function shouldInterruptComposerOnEscape(input: {
  readonly keyName: string | undefined;
  readonly hasDismissibleLayer: boolean;
  readonly showStopAction: boolean;
}): boolean {
  return input.keyName === "escape" && !input.hasDismissibleLayer && input.showStopAction;
}

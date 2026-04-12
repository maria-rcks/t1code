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
        shortcut: "Shift+Enter",
        action: "Insert a newline",
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
        note: "While the terminal is focused, Ctrl+D kills the active terminal tab instead.",
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
        shortcut: "Ctrl+J",
        action: "Show or hide the thread terminal drawer",
      },
      {
        shortcut: "Ctrl+Shift+J",
        action: "Toggle the thread terminal full screen",
      },
      {
        shortcut: "Ctrl+T",
        action: "Open a new terminal tab for the current thread",
      },
      {
        shortcut: "Ctrl+Shift+D",
        action: "Split from the active terminal into another tab",
      },
      {
        shortcut: "Ctrl+W",
        action: "Close the active thread terminal",
      },
      {
        shortcut: "↑ / ↓ / ← / →",
        action: "Send navigation keys to the focused terminal session",
      },
      {
        shortcut: "PageUp / PageDown / Home / End",
        action: "Scroll the focused terminal pane",
      },
      {
        shortcut: "Esc",
        action: "Leave terminal focus and return to the thread view",
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

export function shouldClearComposerOnCtrlC(input: {
  readonly keyName: string | undefined;
  readonly ctrl: boolean | undefined;
  readonly composerFocused: boolean;
  readonly hasComposerText: boolean;
}): boolean {
  return isCtrlC(input) && input.composerFocused && input.hasComposerText;
}

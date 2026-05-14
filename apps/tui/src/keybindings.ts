import {
  MODEL_PICKER_JUMP_KEYBINDING_COMMANDS,
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ModelPickerJumpKeybindingCommand,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";

export interface TuiShortcutEventLike {
  readonly keyName: string;
  readonly sequence?: string;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly super?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface TuiShortcutMatchContext {
  readonly terminalFocus: boolean;
  readonly terminalOpen: boolean;
  readonly modelPickerOpen: boolean;
  readonly [key: string]: boolean;
}

interface TuiShortcutMatchOptions {
  readonly platform?: NodeJS.Platform;
  readonly context?: Partial<TuiShortcutMatchContext>;
}

function isMacPlatform(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

function normalizeEventKey(keyName: string, sequence: string | undefined): string {
  const normalizedName = keyName.toLowerCase();
  if (normalizedName === "esc") return "escape";
  if (normalizedName === "space") return " ";
  if (sequence && sequence.length === 1) return sequence.toLowerCase();
  return normalizedName;
}

function matchesShortcut(
  event: TuiShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform: NodeJS.Platform,
): boolean {
  const key = normalizeEventKey(event.keyName, event.sequence);
  if (key !== shortcut.key) return false;

  const useMetaForMod = isMacPlatform(platform);
  const eventMeta = Boolean(event.meta || event.super);
  const expectedMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);
  return (
    eventMeta === expectedMeta &&
    Boolean(event.ctrl) === expectedCtrl &&
    Boolean(event.shift) === shortcut.shiftKey &&
    Boolean(event.alt) === shortcut.altKey
  );
}

function resolveContext(options: TuiShortcutMatchOptions | undefined): TuiShortcutMatchContext {
  return {
    terminalFocus: false,
    terminalOpen: false,
    modelPickerOpen: false,
    ...options?.context,
  };
}

function evaluateWhenNode(node: KeybindingWhenNode, context: TuiShortcutMatchContext): boolean {
  switch (node.type) {
    case "identifier":
      if (node.name === "true") return true;
      if (node.name === "false") return false;
      return Boolean(context[node.name]);
    case "not":
      return !evaluateWhenNode(node.node, context);
    case "and":
      return evaluateWhenNode(node.left, context) && evaluateWhenNode(node.right, context);
    case "or":
      return evaluateWhenNode(node.left, context) || evaluateWhenNode(node.right, context);
  }
}

function matchesWhenClause(
  whenAst: KeybindingWhenNode | undefined,
  context: TuiShortcutMatchContext,
): boolean {
  if (!whenAst) return true;
  return evaluateWhenNode(whenAst, context);
}

export function resolveTuiShortcutCommand(
  event: TuiShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: TuiShortcutMatchOptions,
): KeybindingCommand | null {
  const platform = options?.platform ?? process.platform;
  const context = resolveContext(options);

  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding) continue;
    if (!matchesWhenClause(binding.whenAst, context)) continue;
    if (!matchesShortcut(event, binding.shortcut, platform)) continue;
    return binding.command;
  }
  return null;
}

export function modelPickerJumpIndexFromCommand(command: string): number | null {
  const index = MODEL_PICKER_JUMP_KEYBINDING_COMMANDS.indexOf(
    command as ModelPickerJumpKeybindingCommand,
  );
  return index === -1 ? null : index;
}

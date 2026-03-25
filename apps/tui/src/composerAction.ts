export type ComposerPrimaryAction = "send" | "stop";

export function resolveComposerPrimaryAction(options: {
  activeThreadIsRunning: boolean;
  hasSendableContent: boolean;
}): ComposerPrimaryAction {
  if (options.activeThreadIsRunning && !options.hasSendableContent) {
    return "stop";
  }
  return "send";
}

import { spawn } from "node:child_process";

export type ClipboardCopyCommand = readonly [command: string, ...args: string[]];

export function resolveClipboardCopyCommands(
  platform: NodeJS.Platform = process.platform,
): readonly ClipboardCopyCommand[] {
  if (platform === "darwin") return [["pbcopy"]];
  if (platform === "win32") {
    return [
      [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
      ["clip.exe"],
    ];
  }
  if (platform === "linux") {
    return [
      ["wl-copy"],
      ["xclip", "-selection", "clipboard"],
      ["xsel", "--clipboard", "--input"],
      ["clip.exe"],
    ];
  }
  return [];
}

export async function copyTextToClipboard(value: string): Promise<void> {
  const commands = resolveClipboardCopyCommands();

  if (commands.length === 0) {
    throw new Error(`Clipboard copy is not supported on ${process.platform}.`);
  }

  let lastError: Error | null = null;
  for (const command of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command[0], command.slice(1), {
          stdio: ["pipe", "ignore", "pipe"],
        });

        let stderr = "";
        child.on("error", (error) => {
          reject(error);
        });
        child.stderr?.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() || `Clipboard helper exited with code ${code ?? -1}.`));
        });
        child.stdin?.end(value);
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("No clipboard helper was available.");
}

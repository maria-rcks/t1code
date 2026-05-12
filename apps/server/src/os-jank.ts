import * as OS from "node:os";
import * as nodePath from "node:path";
import { Effect, Path } from "effect";
import { readPathFromLoginShell } from "@t3tools/shared/shell";

export function fixPath(): void {
  if (process.platform !== "darwin") return;

  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const result = readPathFromLoginShell(shell);
    if (result) {
      process.env.PATH = result;
    }
  } catch {
    // Silently ignore — keep default PATH
  }
}

export function expandHomePathSync(input: string): string {
  if (input === "~") {
    return OS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return nodePath.join(OS.homedir(), input.slice(2));
  }
  return input;
}

export const expandHomePath = (input: string) => Effect.succeed(expandHomePathSync(input));

export const resolveBaseDir = Effect.fn(function* (raw: string | undefined) {
  const { join, resolve } = yield* Path.Path;
  if (!raw || raw.trim().length === 0) {
    return join(OS.homedir(), ".t3");
  }
  return resolve(yield* expandHomePath(raw.trim()));
});

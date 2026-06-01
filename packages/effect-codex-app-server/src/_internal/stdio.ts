import { Cause } from "effect";
import { Effect } from "effect";
import { Queue } from "effect";
import { Sink } from "effect";
import { Stdio } from "effect";
import { Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as CodexError from "../errors.ts";

const encoder = new TextEncoder();

export const makeChildStdio = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Stdio.make({
    args: Effect.succeed([]),
    stdin: handle.stdout,
    stdout: () =>
      Sink.mapInput(handle.stdin, (chunk: string | Uint8Array) =>
        typeof chunk === "string" ? encoder.encode(chunk) : chunk,
      ),
    stderr: () => Sink.drain,
  });

export const makeInMemoryStdio = Effect.fn("makeInMemoryStdio")(function* () {
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done<void>>();
  const output = yield* Queue.unbounded<string>();
  const decoder = new TextDecoder();

  return {
    stdio: Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.fromQueue(input),
      stdout: () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          Queue.offer(
            output,
            typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }),
          ),
        ),
      stderr: () => Sink.drain,
    }),
    input,
    output,
  };
});

export const makeTerminationError = (
  handle: ChildProcessSpawner.ChildProcessHandle,
): Effect.Effect<CodexError.CodexAppServerError> =>
  Effect.match(handle.exitCode, {
    onFailure: (cause) =>
      new CodexError.CodexAppServerTransportError({
        detail: "Failed to determine Codex App Server process exit status",
        cause,
      }),
    onSuccess: (code) => new CodexError.CodexAppServerProcessExitedError({ code }),
  });

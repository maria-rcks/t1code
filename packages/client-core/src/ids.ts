import { CommandId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Effect.runSync(Random.nextUUIDv4);
}

export const newCommandId = (): CommandId => CommandId.makeUnsafe(randomUUID());
export const newProjectId = (): ProjectId => ProjectId.makeUnsafe(randomUUID());
export const newThreadId = (): ThreadId => ThreadId.makeUnsafe(randomUUID());
export const newMessageId = (): MessageId => MessageId.makeUnsafe(randomUUID());

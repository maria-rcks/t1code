import { CommandId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (
      Number(digit) ^
      (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(digit) / 4)))
    ).toString(16),
  );
}

export const newCommandId = (): CommandId => CommandId.make(randomUUID());
export const newProjectId = (): ProjectId => ProjectId.make(randomUUID());
export const newThreadId = (): ThreadId => ThreadId.make(randomUUID());
export const newMessageId = (): MessageId => MessageId.make(randomUUID());

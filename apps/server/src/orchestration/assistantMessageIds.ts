import { MessageId, type TurnId } from "@t3tools/contracts";

export function assistantMessageBaseKey(
  itemId: string | undefined,
  turnId: string | undefined,
  eventId: string,
): string {
  return String(itemId ?? turnId ?? eventId);
}

export function assistantMessageId(baseKey: string, turnId?: TurnId): MessageId {
  return MessageId.make(`assistant:${turnId ? `${turnId}:` : ""}${baseKey}`);
}

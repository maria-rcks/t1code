import * as Duration from "effect/Duration";

type JsonDuration = {
  readonly _tag?: unknown;
  readonly millis?: unknown;
};

function readJsonDurationMillis(duration: unknown): number | null {
  if (!duration || typeof duration !== "object") return null;

  const value = duration as JsonDuration;
  if (value._tag !== "Millis" || typeof value.millis !== "number") return null;

  return Number.isFinite(value.millis) ? value.millis : null;
}

export function durationToSeconds(duration: unknown): number {
  if (typeof duration === "number") {
    return Number.isFinite(duration) ? Math.round(duration / 1_000) : 0;
  }

  try {
    const millis = Duration.toMillis(duration as Duration.Duration);
    return Number.isFinite(millis) ? Math.round(millis / 1_000) : 0;
  } catch {
    const millis = readJsonDurationMillis(duration);
    return millis === null ? 0 : Math.round(millis / 1_000);
  }
}

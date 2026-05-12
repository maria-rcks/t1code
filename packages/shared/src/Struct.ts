import { Predicate } from "effect";

export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export function deepMerge<T extends Record<string, unknown>>(current: T, patch: DeepPartial<T>): T {
  if (!Predicate.isObject(current) || !Predicate.isObject(patch)) {
    return patch as T;
  }

  const next = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    const existing = next[key];
    next[key] =
      Predicate.isObject(existing) && Predicate.isObject(value)
        ? deepMerge(existing, value)
        : value;
  }

  return next as T;
}

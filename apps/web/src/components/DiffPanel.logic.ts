export function resolveTurnStripMaskImage(input: {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}): string | undefined {
  if (!input.canScrollLeft && !input.canScrollRight) {
    return undefined;
  }

  return `linear-gradient(to right, ${input.canScrollLeft ? "transparent 24px, black 72px" : "black"}, ${
    input.canScrollRight ? "black calc(100% - 72px), transparent calc(100% - 24px)" : "black"
  })`;
}

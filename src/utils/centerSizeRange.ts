export function centerSizeRange<T>(items: readonly T[], centerOf: (item: T) => number, sizeOf: (item: T) => number) {
  let min = Infinity;
  let max = -Infinity;

  for (const item of items) {
    const center = centerOf(item);
    const half = sizeOf(item) / 2;

    min = Math.min(min, center - half);
    max = Math.max(max, center + half);
  }

  return { min, max };
}

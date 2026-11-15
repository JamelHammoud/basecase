export function surfaceSampleIndex(values: ArrayLike<number>, target: number): number {
  let lo = 0;
  let hi = values.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;

    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

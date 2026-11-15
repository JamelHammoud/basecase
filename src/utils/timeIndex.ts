export function timeIndex(
  samples: readonly { t: number }[],
  time: number,
  edge: 'at-or-after' | 'after' = 'at-or-after',
): number {
  let low = 0;
  let high = samples.length;

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const t = samples[mid].t;

    if (t > time || (edge === 'at-or-after' && t === time)) high = mid;
    else low = mid + 1;
  }

  return low;
}

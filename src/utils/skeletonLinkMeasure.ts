import type { ZUpVec } from '../types/skeleton';

export function measureSkeletonLink(origin: ZUpVec, ends: readonly ZUpVec[]): { length: number; at: ZUpVec } {
  if (!ends.length) return { length: 0, at: origin };

  const weighted: ZUpVec = [0, 0, 0];
  let length = 0;
  let total = 0;

  for (const end of ends) {
    const distance = Math.hypot(end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]);
    const weight = distance || 1;

    length = Math.max(length, distance);
    total += weight;

    for (let k = 0; k < 3; k++) weighted[k] += ((origin[k] + end[k]) / 2) * weight;
  }

  return { length, at: weighted.map((value) => value / total) as ZUpVec };
}

import type { V3 } from './material';
import type { ScrewLine } from './mesh';

export function screwRegion(line: ScrewLine, slack: number): (p: V3) => boolean {
  const from: V3 = [...line.from];
  const d = [0, 1, 2].map((k) => line.to[k] - from[k]);
  const len2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1;
  const len = Math.sqrt(len2);
  const radius = line.radius;

  return (p) => {
    const x = p[0] - from[0];
    const y = p[1] - from[1];
    const z = p[2] - from[2];
    const t = (x * d[0] + y * d[1] + z * d[2]) / len2;

    if (t * len < -slack || (t - 1) * len > slack) return false;

    return Math.hypot(x - t * d[0], y - t * d[1], z - t * d[2]) <= radius;
  };
}

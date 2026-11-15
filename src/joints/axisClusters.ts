import { lineTolerance, type Pairing } from './axisFinder';
import { dot, scale, sub } from './meshIndex';

export interface AxisLink {
  shaft: string;
  bore: string;
  pairing: Pairing;
}

const PARALLEL_COS = Math.cos(Math.PI / 180);

export function collinear(p: Pairing, q: Pairing) {
  if (Math.abs(dot(p.axis, q.axis)) < PARALLEL_COS) return false;

  const d = sub(q.origin, p.origin);

  return Math.hypot(...sub(d, scale(p.axis, dot(d, p.axis)))) <= lineTolerance(Math.max(p.radius, q.radius));
}

export function axisClusters(links: AxisLink[]): AxisLink[][] {
  const byShaft = new Map<string, AxisLink[][]>();
  const out: AxisLink[][] = [];

  for (const link of links) {
    const shaft = link.shaft;
    const groups = byShaft.get(shaft) ?? [];
    const home = groups.find((c) => collinear(c[0].pairing, link.pairing));

    if (home) {
      home.push(link);

      continue;
    }

    const group = [link];

    groups.push(group);
    byShaft.set(shaft, groups);
    out.push(group);
  }

  return out;
}

import * as THREE from 'three';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { CellMask } from './cellMask';
import { smoothField, type PointTest } from './gridField';
import { levelSetSolid, type ManifoldApi, type Solid } from './manifold';

export type { PointTest };

import type { Motion } from './sweepRaster';
import type { V3 } from './solidField';
import { cross, perpendicular, unit, type Bounds } from './vec';

const FLOOR_GAP_MM = 0.5;
const TWO_PI = Math.PI * 2;

export function overlap(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a || !b) return null;

  const min = [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])) as V3;
  const max = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) as V3;

  return min.every((v, k) => v < max[k]) ? { min, max } : null;
}

export function merged(boxes: Array<Bounds | null>): Bounds | null {
  const present = boxes.filter((b): b is Bounds => b !== null);

  if (!present.length) return null;

  return {
    min: [0, 1, 2].map((k) => Math.min(...present.map((b) => b.min[k]))) as V3,
    max: [0, 1, 2].map((k) => Math.max(...present.map((b) => b.max[k]))) as V3,
  };
}

export function fieldSolid(api: ManifoldApi, test: PointTest, bounds: Bounds | null, edge: number): Solid | null {
  if (!bounds) return null;

  const pad = edge * 2;
  const box = {
    min: bounds.min.map((v) => v - pad) as V3,
    max: bounds.max.map((v) => v + pad) as V3,
  };
  const sdf = smoothField(test, box, edge);

  return sdf && levelSetSolid(api, { sdf, box, edge, tolerance: -1 });
}

export function nearSurface(soups: Float32Array[], within: number): { test: PointTest; dispose: () => void } {
  const total = soups.reduce((n, s) => n + s.length, 0);
  const joined = new Float32Array(total);

  soups.reduce((at, s) => (joined.set(s, at), at + s.length), 0);

  const solid = solidFromPositions(joined);
  const mask = new CellMask(joined, within);
  const at = new THREE.Vector3();

  return {
    test: (x, y, z) =>
      mask.has(x, y, z) && solid.bvh.closestPointToPoint(at.set(x, y, z), undefined, 0, within) !== null,
    dispose: () => solid.dispose(),
  };
}

function lowestCos(from: number, to: number): number {
  const turn = Math.ceil((from - Math.PI) / TWO_PI);

  if (Math.PI + turn * TWO_PI <= to) return -1;

  return Math.min(Math.cos(from), Math.cos(to));
}

export function dipsBelow(motion: Motion, floorY: number): PointTest {
  const axis = unit(motion.axis);
  const [lo, hi] = motion.range;
  const limit = floorY + FLOOR_GAP_MM;

  if (motion.kind === 'prismatic') return (_x, y) => y + Math.min(lo * axis[1], hi * axis[1]) < limit;

  const u = perpendicular(axis);
  const w = cross(axis, u);
  const reach = Math.hypot(u[1], w[1]);
  const phase = Math.atan2(w[1], u[1]);
  const { origin } = motion;

  return (x, y, z) => {
    const d = [x - origin[0], y - origin[1], z - origin[2]];
    const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const a = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    const b = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
    const angle = Math.atan2(b, a) - phase;
    const low = origin[1] + along * axis[1] + Math.hypot(a, b) * reach * lowestCos(angle + lo, angle + hi);

    return low < limit;
  };
}

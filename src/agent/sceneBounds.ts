import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { eulerToMatrix, r2, toCad, type V3 } from './agentFrame';

function worldBox(p: ScenePart): { min: V3; max: V3 } {
  const hx = p.dimensions.width / 2,
    hy = p.dimensions.height / 2,
    hz = p.dimensions.depth / 2;
  const m = eulerToMatrix(p.rotation);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  const corners = [-hx, hx].flatMap((cx) => [-hy, hy].flatMap((cy) => [-hz, hz].map((cz) => [cx, cy, cz] as V3)));

  for (const [cx, cy, cz] of corners) {
    const v = new THREE.Vector3(cx, cy, cz).applyMatrix4(m);
    const w: V3 = [v.x + p.position[0], v.y + p.position[1], v.z + p.position[2]];

    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], w[i]);
      max[i] = Math.max(max[i], w[i]);
    }
  }

  return { min, max };
}

function boxToCad(b: { min: V3; max: V3 }) {
  const a = toCad(b.min);
  const c = toCad(b.max);

  return {
    min: [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])].map(r2),
    max: [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])].map(r2),
  };
}

export type PartBoxes = Record<string, { min: V3; max: V3 } | undefined>;

export const partBoundsCad = (p: ScenePart, measured?: PartBoxes) => boxToCad(measured?.[p.id] ?? worldBox(p));

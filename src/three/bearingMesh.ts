import * as THREE from 'three';
import { thrustBearing } from '../data/motionHardware';
import { FLANGED_BEARINGS, LINEAR_BUSHINGS } from '../data/motionTables';
import type { BuildContext } from './hardwareMesh';
import { circleShape, holePath, lathe, prism } from './hardwarePrimitives';

export function ring(rIn: number, rOut: number, height: number, y0 = 0): THREE.BufferGeometry {
  const s = circleShape(rOut);

  s.holes.push(holePath(rIn, 48));

  return prism(s, height, y0);
}

function shaft({ spec, L, add }: BuildContext) {
  const r = Number(spec.size) / 2;
  const c = Math.min(0.5, r * 0.15);

  add(
    lathe(
      [
        [0, 0],
        [r - c, 0],
        [r, c],
        [r, L - c],
        [r - c, L],
        [0, L],
      ],
      32,
    ),
  );
}

function grooveProfile(R: number, L: number, grooves: Array<{ y: number; w: number; r: number }>) {
  const out: Array<[number, number]> = [[R, 0]];

  for (const g of grooves) out.push([R, g.y - g.w / 2], [g.r, g.y - g.w / 2], [g.r, g.y + g.w / 2], [R, g.y + g.w / 2]);

  out.push([R, L]);

  return out;
}

function linearBearing({ spec, m, add }: BuildContext) {
  const b = LINEAR_BUSHINGS[spec.size];
  const R = b.D / 2;
  const ri = b.d / 2 + (b.D - b.d) * 0.22;
  const grooves =
    b.B && b.W && b.D1 ? [-1, 1].map((k) => ({ y: b.L / 2 + (k * b.B!) / 2, w: b.W!, r: b.D1! / 2 })) : [];

  add(lathe([[ri, b.L], [ri, 0], ...grooveProfile(R, b.L, grooves), [ri, b.L]], 40));
  add(ring(b.d / 2, ri, b.L), m.dark, false);
}

function flangedBearing({ spec, m, add }: BuildContext) {
  const b = FLANGED_BEARINGS[spec.size];
  const wall = (b.D - b.d) * 0.17;
  const B = b.Bzz;

  add(
    lathe(
      [
        [b.D / 2 - wall, 0],
        [b.D / 2, 0],
        [b.D / 2, B - b.C1zz],
        [b.D1zz / 2, B - b.C1zz],
        [b.D1zz / 2, B],
        [b.D / 2 - wall, B],
        [b.D / 2 - wall, 0],
      ],
      48,
    ),
  );
  add(ring(b.d / 2, b.d / 2 + wall, B));
  add(ring(b.d / 2 + wall, b.D / 2 - wall, B * 0.9, B * 0.05), m.dark, false);
}

function thrust({ spec, m, add }: BuildContext) {
  const b = thrustBearing(spec.size);
  const washer = b.T * 0.3;
  const inset = (b.D - b.d) * 0.12;

  add(ring(b.d / 2, b.shaftOd / 2, washer));
  add(ring(b.housingBore / 2, b.D / 2, washer, b.T - washer));
  add(ring(b.d / 2 + inset, b.D / 2 - inset, b.T - washer * 2, washer), m.dark, false);
}

export const BEARING_BUILDERS = {
  shaft,
  linear_bearing: linearBearing,
  flanged_bearing: flangedBearing,
  thrust_bearing: thrust,
};

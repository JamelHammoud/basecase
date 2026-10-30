import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import type { FastenerChain } from './assemblyTypes';
import { insideSolid, perpendicularBasis, ringAround } from './probe';

export type DriverTool = 'straight' | 'L-key' | 'ball-end';

export interface DriverOption {
  tool: DriverTool;
  blockers: string[];
}

const BIT_MM = 32;
const STRAIGHT_MM = 92;
const BIT_R = 1.6;
const HANDLE_R = 5.5;
const BALL_TILT = 0.35;
const BALL_MM = 60;
const KEY_SHORT_ARM_MM = 21;
const KEY_HEIGHTS = [19, 21, 23];
const KEY_RADII = [8, 18, 30, 44, 56];
const KEY_SECTORS = 6;

interface Path {
  top: THREE.Vector3;
  axis: THREE.Vector3;
  near: Placed[];
}

function hitsInto(path: Path, points: THREE.Vector3[], into: Set<string>) {
  for (const m of path.near) {
    if (!into.has(m.id) && points.some((p) => insideSolid(m, p))) into.add(m.id);
  }
}

const disc = (centre: THREE.Vector3, axis: THREE.Vector3, r: number) => [centre, ...ringAround(centre, axis, r, 12)];

function along(path: Path, dir: THREE.Vector3, reach: { length: number; bit: number; step: (t: number) => number }) {
  const set = new Set<string>();

  for (let t = 1; t <= reach.length; t += reach.step(t)) {
    hitsInto(path, disc(path.top.clone().addScaledVector(dir, t), dir, t <= reach.bit ? BIT_R : HANDLE_R), set);
  }

  return set;
}

function straight(path: Path): DriverOption {
  const set = along(path, path.axis, { length: STRAIGHT_MM, bit: BIT_MM, step: (t) => (t < 40 ? 1 : 2.5) });

  return { tool: 'straight', blockers: [...set] };
}

function lKeys(path: Path): DriverOption[] {
  const shortArm = along(path, path.axis, { length: KEY_SHORT_ARM_MM, bit: KEY_SHORT_ARM_MM, step: () => 1 });
  const [u, w] = perpendicularBasis(path.axis);

  return Array.from({ length: KEY_SECTORS }, (_, k) => {
    const set = new Set(shortArm);
    const points = KEY_HEIGHTS.flatMap((h) =>
      KEY_RADII.flatMap((r) =>
        [-0.5, 0, 0.5].map((da) => {
          const a = (k * 2 * Math.PI) / KEY_SECTORS + da;

          return path.top
            .clone()
            .addScaledVector(path.axis, h)
            .addScaledVector(u, Math.cos(a) * r)
            .addScaledVector(w, Math.sin(a) * r);
        }),
      ),
    );

    hitsInto(path, points, set);

    return { tool: 'L-key' as const, blockers: [...set] };
  });
}

function ballEnds(path: Path): DriverOption[] {
  const [u, w] = perpendicularBasis(path.axis);

  return Array.from({ length: 8 }, (_, k) => {
    const az = (k * Math.PI) / 4;
    const tilt = path.axis
      .clone()
      .multiplyScalar(Math.cos(BALL_TILT))
      .addScaledVector(u, Math.sin(BALL_TILT) * Math.cos(az))
      .addScaledVector(w, Math.sin(BALL_TILT) * Math.sin(az))
      .normalize();
    const set = along(path, tilt, { length: BALL_MM, bit: 40, step: () => 1 });

    return { tool: 'ball-end' as const, blockers: [...set] };
  });
}

export function driverOptions(chain: FastenerChain, solids: Placed[], skip: Set<string>): DriverOption[] {
  const top = new THREE.Vector3(...chain.top);
  const axis = new THREE.Vector3(...chain.axis);
  const reach = new THREE.Box3().setFromPoints([top, top.clone().addScaledVector(axis, STRAIGHT_MM + 20)]);
  const near = solids.filter(
    (m) => m.id !== chain.id && !skip.has(m.id) && m.box.intersectsBox(reach.clone().expandByScalar(60)),
  );
  const path = { top, axis, near };

  return [straight(path), ...lKeys(path), ...ballEnds(path)];
}

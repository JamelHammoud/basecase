import * as THREE from 'three';
import { distanceTo } from '../../assembly/probe';
import type { Placed } from '../../three/analysis/collide';
import { printReportOf } from '../../three/analysis/shapeReports';
import { checkPrintability } from '../../three/printability';
import type { Bed } from '../bed';
import { choosePose } from '../plan';
import type { LeftOutReason } from './mergeTypes';

export const NEW_SUPPORT_MM3 = 2000;

const SEAM_MM = 0.05;

const onSurface = (others: Placed[], points: THREE.Vector3[]) =>
  others.some((o) => points.every((v) => distanceTo(o, v, SEAM_MM) <= SEAM_MM));

function worldTriangles(members: Placed[]): Float32Array {
  const out: number[] = [];

  for (const m of members) {
    const others = members.filter((o) => o !== m);
    const pos = m.solid.positions;

    for (let i = 0; i < pos.length; i += 9) {
      const tri = [0, 3, 6].map((k) =>
        new THREE.Vector3(pos[i + k], pos[i + k + 1], pos[i + k + 2]).applyMatrix4(m.matrix),
      );
      const centre = tri[0].clone().add(tri[1]).add(tri[2]).divideScalar(3);

      if (!onSurface(others, [...tri, centre])) out.push(...tri.flatMap((v) => v.toArray()));
    }
  }

  return new Float32Array(out);
}

function apartSupport(members: Placed[], bed: Bed): number {
  return members.reduce((sum, m) => {
    const shape = printReportOf(m.solid).check;

    return sum + (shape ? choosePose(shape, bed).supportMm3 : 0);
  }, 0);
}

export function printProblem(members: Placed[], bed: Bed): LeftOutReason | null {
  const union = checkPrintability(worldTriangles(members));

  if (!union) return { code: 'bed' };

  const pick = choosePose(union, bed);

  if (!pick.fits) return { code: 'bed' };

  const extra = pick.supportMm3 - apartSupport(members, bed);

  return extra > NEW_SUPPORT_MM3 ? { code: 'support', mm3: Math.round(extra) } : null;
}

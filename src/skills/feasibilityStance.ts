import { convexHull } from '../utils/convexHull';
import { pivotRow } from '../utils/matrixScans';
import {
  bodyCorners,
  bodyPoint,
  chainOf,
  reachPoint,
  refresh,
  toLocal,
  type Kin,
  type V3,
} from './feasibilityKinematics';

export const GRAVITY = 9.81;
export const CROUCH = 0.15;

const FOOT_BAND = 0.01;
const SOLE_BAND = 0.001;
const RIDGE = 1e-6;

export interface Foot {
  body: number;
  local: V3;
  sole: V3[];
}

export interface PointLoad {
  body: number;
  local: V3;
  force: number;
}

export function robotMassKg(kin: Kin): number {
  return kin.bodies.members.reduce((s, b) => s + kin.model.body_mass[b], 0);
}

export function centerOfMass(kin: Kin): V3 {
  const bodies = kin.bodies.members;
  const mass = robotMassKg(kin);
  const c: V3 = [0, 0, 0];

  for (const b of bodies)
    for (let k = 0; k < 3; k++) c[k] += (kin.model.body_mass[b] * kin.data.xipos[b * 3 + k]) / mass;

  return c;
}

function lowest(points: V3[]): number {
  return points.reduce((low, p) => Math.min(low, p[2]), Infinity);
}

export function findFeet(kin: Kin): Foot[] {
  const leaves = kin.bodies.leaves;
  const corners = new Map(leaves.map((b) => [b, bodyCorners(kin, b)]));
  const ground = Math.min(...leaves.map((b) => lowest(corners.get(b)!)));

  return leaves
    .filter((b) => lowest(corners.get(b)!) <= ground + FOOT_BAND)
    .map((body) => {
      const all = corners.get(body)!;
      const low = lowest(all);
      const sole = all.filter((p) => p[2] <= low + SOLE_BAND);
      const centre = [0, 1, 2].map((k) => sole.reduce((s, p) => s + p[k], 0) / sole.length) as V3;

      return { body, local: toLocal(kin, body, centre), sole };
    });
}

function solveSmall(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let c = 0; c < n; c++) {
    const pivot = pivotRow(m, c);

    [m[c], m[pivot]] = [m[pivot], m[c]];

    for (let r = 0; r < n; r++) {
      const f = r === c ? 0 : m[r][c] / m[c][c];

      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

export function shareWeight(points: V3[], com: V3, weight: number): number[] {
  const rows = [points.map(() => 1), points.map((p) => p[0] - com[0]), points.map((p) => p[1] - com[1])];
  const aat = rows.map((r) => rows.map((s) => r.reduce((sum, v, i) => sum + v * s[i], 0)));

  const ridge = RIDGE * (aat[0][0] + aat[1][1] + aat[2][2]);

  aat.forEach((row, i) => (row[i] += ridge));

  const y = solveSmall(aat, [weight, 0, 0]);

  return points.map((_, i) => rows.reduce((s, r, k) => s + r[i] * y[k], 0));
}

export function crouch(kin: Kin, feet: Foot[]): number {
  const targets = feet.map((f) => bodyPoint(kin, f.body, f.local));
  const rootZ = kin.model.jnt_qposadr[kin.model.body_jntadr[kin.root]] + 2;
  const drop = CROUCH * (kin.data.xpos[kin.root * 3 + 2] - Math.min(...targets.map((t) => t[2])));

  kin.data.qpos[rootZ] -= drop;
  refresh(kin);

  return Math.max(
    ...feet.map((f, i) =>
      reachPoint(kin, { body: f.body, local: f.local, target: targets[i], joints: chainOf(kin, f.body) }),
    ),
  );
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function supportMargin(sole: V3[], com: V3): number {
  if (sole.length < 2) return -Infinity;

  const hull = convexHull(sole.map((p) => [p[0], p[1]]));
  const p: [number, number] = [com[0], com[1]];
  let distance = Infinity;
  let inside = hull.length >= 3;

  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];

    distance = Math.min(distance, segmentDistance(p, a, b));

    inside = inside && (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0;
  }

  return inside ? distance : -distance;
}

import {
  bodyCorners,
  bodyPoint,
  chainOf,
  isUnder,
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

function robotBodies(kin: Kin): number[] {
  const out: number[] = [];

  for (let b = kin.root; b < kin.model.nbody; b++) if (isUnder(kin, b)) out.push(b);

  return out;
}

const isLeaf = (kin: Kin, body: number) =>
  !robotBodies(kin).some((b) => b !== body && kin.model.body_parentid[b] === body);

export function robotMassKg(kin: Kin): number {
  return robotBodies(kin).reduce((s, b) => s + kin.model.body_mass[b], 0);
}

export function centerOfMass(kin: Kin): V3 {
  const bodies = robotBodies(kin);
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
  const leaves = robotBodies(kin).filter((b) => b !== kin.root && isLeaf(kin, b));
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
    const pivot = m.slice(c).reduce((best, row, i) => (Math.abs(row[c]) > Math.abs(m[best][c]) ? c + i : best), c);

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

function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) =>
    list.reduce<[number, number][]>((h, p) => {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();

      h.push(p);

      return h;
    }, []);
  const lower = half(sorted);
  const upper = half([...sorted].reverse());

  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function supportMargin(sole: V3[], com: V3): number {
  const hull = convexHull(sole.map((p) => [p[0], p[1]]));
  const p: [number, number] = [com[0], com[1]];
  const edges = hull.map((a, i) => [a, hull[(i + 1) % hull.length]] as const);
  const distance = Math.min(...edges.map(([a, b]) => segmentDistance(p, a, b)));
  const inside =
    hull.length >= 3 && edges.every(([a, b]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) > 0);

  return inside ? distance : -distance;
}

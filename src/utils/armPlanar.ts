import type { ZUpVec } from '../types/skeleton';

export interface ArmGeometry {
  shoulderMm: number;
  shoulderZ: number;
  toolMm: number;
  toolSideMm: number;
  yaw: [number, number];
  pitch: Array<[number, number]>;
}

export interface ArmShape {
  upperArm: number;
  forearm: number;
  riser: number;
}

export interface PlaneTarget {
  rho: number;
  z: number;
  yaw: number;
}

export interface PlanarPose {
  yaw: number;
  pitch: [number, number, number];
  slack: number;
}

interface Sweep {
  phi: Float64Array;
  d2: Float64Array;
  angle: Float64Array;
  lo: number;
  hi: number;
}

const DEG = Math.PI / 180;

export const wrapDeg = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

const inside = (v: number, [lo, hi]: [number, number]) => v >= lo - 1e-9 && v <= hi + 1e-9;
const slackOf = (v: number, [lo, hi]: [number, number]) => Math.min(v - lo, hi - v) / (hi - lo);

export function bearingDeg(from: ZUpVec, to: ZUpVec): number {
  return Math.atan2(to[0] - from[0], -(to[1] - from[1])) / DEG;
}

export function planeTargets(geo: ArmGeometry, target: ZUpVec, base: { at: ZUpVec; heading: number }): PlaneTarget[] {
  const d = Math.hypot(target[0] - base.at[0], target[1] - base.at[1]);

  if (d < geo.toolSideMm) return [];

  const rho = Math.sqrt(d * d - geo.toolSideMm ** 2);
  const beta = bearingDeg(base.at, target) - base.heading;
  const z = target[2] - base.at[2];

  return [rho, -rho]
    .map((r) => ({ rho: r, z, yaw: wrapDeg(beta - Math.atan2(geo.toolSideMm, r) / DEG) }))
    .filter((t) => inside(t.yaw, geo.yaw));
}

const sweepCache = new WeakMap<PlaneTarget, Map<string, Sweep>>();

function sweepOf(geo: ArmGeometry, target: PlaneTarget, riser: number, stepDeg: number): Sweep {
  const key = `${riser}:${stepDeg}`;
  const cached = sweepCache.get(target)?.get(key);

  if (cached) return cached;

  const n = Math.round(360 / stepDeg);
  const sweep: Sweep = {
    phi: new Float64Array(n),
    d2: new Float64Array(n),
    angle: new Float64Array(n),
    lo: 1e9,
    hi: 0,
  };
  const sz = geo.shoulderZ + riser;

  for (let i = 0; i < n; i++) {
    const phi = -180 + i * stepDeg;
    const dx = target.rho - geo.toolMm * Math.cos(phi * DEG) - geo.shoulderMm;
    const dz = target.z - geo.toolMm * Math.sin(phi * DEG) - sz;
    const d2 = dx * dx + dz * dz;

    sweep.phi[i] = phi;
    sweep.d2[i] = d2;
    sweep.angle[i] = Math.atan2(dz, dx) / DEG;
    sweep.lo = Math.min(sweep.lo, Math.sqrt(d2));
    sweep.hi = Math.max(sweep.hi, Math.sqrt(d2));
  }

  const forTarget = sweepCache.get(target) ?? new Map<string, Sweep>();

  forTarget.set(key, sweep);
  sweepCache.set(target, forTarget);

  return sweep;
}

function elbowCos(geo: ArmGeometry): number {
  const [lo, hi] = geo.pitch[1];

  return lo <= 0 && hi >= 0 ? Math.cos(Math.max(-lo, hi) * DEG) : -1;
}

export function couldReach(geo: ArmGeometry, sweep: Pick<Sweep, 'lo' | 'hi'>, shape: ArmShape): boolean {
  const { upperArm: u, forearm: f } = shape;
  const nearest = Math.sqrt(Math.max(0, u * u + f * f + 2 * u * f * elbowCos(geo)));

  return u + f >= sweep.lo && nearest <= sweep.hi;
}

interface Candidate {
  geo: ArmGeometry;
  shape: ArmShape;
  phi: number;
  d2: number;
  angle: number;
}

function posesAt({ geo, shape, phi, d2, angle }: Candidate): Array<[number, number, number]> {
  const { upperArm: u, forearm: f } = shape;
  const c2 = (d2 - u * u - f * f) / (2 * u * f);

  if (c2 > 1 || c2 < -1) return [];

  const out: Array<[number, number, number]> = [];

  for (const sign of [1, -1]) {
    const t2 = (sign * Math.acos(c2)) / DEG;
    const t1 = angle - Math.atan2(f * Math.sin(t2 * DEG), u + f * Math.cos(t2 * DEG)) / DEG;
    const t3 = wrapDeg(phi - t1 - t2);
    const pose: [number, number, number] = [wrapDeg(t1), t2, t3];

    if (pose.every((v, k) => inside(v, geo.pitch[k]))) out.push(pose);
  }

  return out;
}

export function planarPose(
  geo: ArmGeometry,
  target: PlaneTarget,
  shape: ArmShape,
  opts: { stepDeg: number; best?: boolean },
): PlanarPose | null {
  const sweep = sweepOf(geo, target, shape.riser, opts.stepDeg);

  if (!couldReach(geo, sweep, shape)) return null;

  let best: PlanarPose | null = null;

  for (let i = 0; i < sweep.phi.length; i++) {
    for (const pitch of posesAt({ geo, shape, phi: sweep.phi[i], d2: sweep.d2[i], angle: sweep.angle[i] })) {
      const slack = Math.min(slackOf(target.yaw, geo.yaw), ...pitch.map((v, k) => slackOf(v, geo.pitch[k])));

      if (!best || slack > best.slack) best = { yaw: target.yaw, pitch, slack };

      if (!opts.best) return best;
    }
  }

  return best;
}

export function sweepBounds(geo: ArmGeometry, target: PlaneTarget, riser: number, stepDeg: number) {
  const { lo, hi } = sweepOf(geo, target, riser, stepDeg);

  return { lo, hi };
}

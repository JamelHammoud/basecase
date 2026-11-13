export type Vec2 = [number, number];

export interface FourBar {
  ground: number;
  crank: number;
  coupler: number;
  rocker: number;
  point: Vec2;
}

export type Links = Pick<FourBar, 'ground' | 'crank' | 'coupler' | 'rocker'>;

export interface PlacedFourBar extends FourBar {
  origin: Vec2;
  angle: number;
}

export type GrashofClass =
  'crank-rocker' | 'rocker-crank' | 'double-crank' | 'double-rocker' | 'change-point' | 'triple-rocker';

export interface FourBarPose {
  b: Vec2;
  c: Vec2;
  p: Vec2;
}

const DEG = Math.PI / 180;
const CHANGE_POINT_TOLERANCE = 1e-9;

export const toRadians = (deg: number) => deg * DEG;
export const toDegrees = (rad: number) => rad / DEG;

export function closure(l: Links, theta: number): { b: Vec2; c: Vec2 } | null {
  const b: Vec2 = [l.crank * Math.cos(theta), l.crank * Math.sin(theta)];
  const vx = l.ground - b[0];
  const vy = -b[1];
  const e = Math.hypot(vx, vy);

  if (e > l.coupler + l.rocker || e < Math.abs(l.coupler - l.rocker) || e === 0) return null;

  const phi = Math.atan2(vy, vx);
  const alpha = Math.acos(
    Math.min(1, Math.max(-1, (l.coupler * l.coupler + e * e - l.rocker * l.rocker) / (2 * l.coupler * e))),
  );

  return { b, c: [b[0] + l.coupler * Math.cos(phi + alpha), b[1] + l.coupler * Math.sin(phi + alpha)] };
}

export function couplerOffset(b: Vec2, c: Vec2, point: Vec2, coupler: number): Vec2 {
  const ux = (c[0] - b[0]) / coupler;
  const uy = (c[1] - b[1]) / coupler;

  return [b[0] + point[0] * ux - point[1] * uy, b[1] + point[0] * uy + point[1] * ux];
}

export function fourBarPose(l: FourBar, thetaDeg: number): FourBarPose | null {
  const closed = closure(l, toRadians(thetaDeg));

  return closed && { ...closed, p: couplerOffset(closed.b, closed.c, l.point, l.coupler) };
}

export function placed(l: Pick<PlacedFourBar, 'origin' | 'angle'>, [x, y]: Vec2): Vec2 {
  const a = toRadians(l.angle);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  return [l.origin[0] + x * cos - y * sin, l.origin[1] + x * sin + y * cos];
}

export function couplerPoint(l: PlacedFourBar, thetaDeg: number): Vec2 | null {
  const pose = fourBarPose(l, thetaDeg);

  return pose && placed(l, pose.p);
}

export function linkAngles(l: Links, thetaDeg: number): { coupler: number; rocker: number } | null {
  const closed = closure(l, toRadians(thetaDeg));

  if (!closed) return null;

  const { b, c } = closed;

  return {
    coupler: toDegrees(Math.atan2(c[1] - b[1], c[0] - b[0])),
    rocker: toDegrees(Math.atan2(c[1], c[0] - l.ground)),
  };
}

export function grashofClass(l: FourBar): GrashofClass {
  const links = [l.ground, l.crank, l.coupler, l.rocker];
  const sorted = [...links].sort((a, b) => a - b);
  const slack = sorted[1] + sorted[2] - sorted[0] - sorted[3];

  if (Math.abs(slack) < CHANGE_POINT_TOLERANCE * sorted[3]) return 'change-point';

  if (slack < 0) return 'triple-rocker';

  const shortest = links.indexOf(sorted[0]);
  const byShortest: GrashofClass[] = ['double-crank', 'crank-rocker', 'double-rocker', 'rocker-crank'];

  return byShortest[shortest];
}

const deviation = (cos: number) => {
  const mu = toDegrees(Math.acos(Math.min(1, Math.max(-1, cos))));

  return Math.min(mu, 180 - mu);
};

export function minTransmission(l: FourBar): number {
  const at = (e: number) => (l.coupler ** 2 + l.rocker ** 2 - e * e) / (2 * l.coupler * l.rocker);

  return Math.min(deviation(at(Math.abs(l.ground - l.crank))), deviation(at(l.ground + l.crank)));
}

export function couplerCurve(l: PlacedFourBar, from: number, to: number, samples: number): Vec2[] {
  const out: Vec2[] = [];

  for (let i = 0; i <= samples; i++) {
    const p = couplerPoint(l, from + ((to - from) * i) / samples);

    if (p) out.push(p);
  }

  return out;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;

  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function distanceToCurve(p: Vec2, curve: Vec2[]): number {
  if (curve.length === 1) return Math.hypot(p[0] - curve[0][0], p[1] - curve[0][1]);

  let best = Infinity;

  for (let i = 1; i < curve.length; i++) best = Math.min(best, segmentDistance(p, curve[i - 1], curve[i]));

  return best;
}

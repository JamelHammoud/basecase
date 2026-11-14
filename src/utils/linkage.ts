import { decode, encode, levenbergMarquardt, type FitBounds, type FitLinkage, type FitProblem } from './linkageFit';
import {
  placed,
  closure,
  couplerCurve,
  couplerOffset,
  couplerPoint,
  distanceToCurve,
  grashofClass,
  minTransmission,
  toDegrees,
  type GrashofClass,
  type PlacedFourBar,
  type Vec2,
} from './linkageKinematics';
import { seededRandom, type Random } from './seededRandom';

export type { FourBar, GrashofClass, PlacedFourBar, Vec2 } from './linkageKinematics';
export { couplerCurve, couplerPoint, fourBarPose, linkAngles, placed } from './linkageKinematics';

export const MIN_PATH_POINTS = 5;
export const MAX_PATH_POINTS = 12;
export const MIN_LINK_MM = 10;
export const MAX_LINK_MM = 300;

export interface LinkageSolution {
  linkage: PlacedFourBar;
  maxErrorMm: number;
  rmsErrorMm: number;
  minTransmissionDeg: number;
  crank: [number, number];
  grashof: GrashofClass;
}

const SEED = '4f0ba5e04f0ba5e04f0ba5e04f0ba5e0';
const STARTS_PER_DIRECTION = 36;
const KEEP = 3;
const CURVE_SAMPLES = 720;
const ACCEPT_SHARE = 0.1;
const ACCEPT_FLOOR_MM = 1;
const SAME_SHARE = 0.03;
const MIN_TRANSMISSION_DEG = 15;
const ERROR_BUCKET_MM = 0.25;

interface Frame {
  center: Vec2;
  scale: number;
}

function frameOf(points: Vec2[]): Frame {
  const center: Vec2 = [0, 1].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length) as Vec2;
  const scale = Math.max(...points.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1])));

  return { center, scale: scale || 1 };
}

const between = (random: Random, lo: number, hi: number) => lo + (hi - lo) * random();

function randomShape(random: Random): Omit<FitLinkage, 'origin' | 'angle' | 'thetas'> {
  for (;;) {
    const crank = between(random, 0.2, 1);
    const [ground, coupler, rocker] = [0, 1, 2].map(() => crank * between(random, 1.3, 4.5));
    const links = [ground, coupler, rocker];
    const longest = Math.max(...links);

    if (crank + longest < links.reduce((s, v) => s + v, 0) - longest) {
      return {
        ground,
        crank,
        coupler,
        rocker,
        point: [between(random, -1.5, 1.5) * coupler, between(random, -1.5, 1.5) * coupler],
      };
    }
  }
}

function localPoints(shape: Omit<FitLinkage, 'origin' | 'angle'>): Vec2[] {
  return shape.thetas.map((theta) => {
    const closed = closure(shape, theta)!;

    return couplerOffset(closed.b, closed.c, shape.point, shape.coupler);
  });
}

function similarity(from: Vec2[], to: Vec2[]) {
  const mean = (ps: Vec2[]): Vec2 => [0, 1].map((k) => ps.reduce((s, p) => s + p[k], 0) / ps.length) as Vec2;
  const [fc, tc] = [mean(from), mean(to)];
  let dot = 0;
  let cross = 0;
  let norm = 0;

  from.forEach((f, i) => {
    const [ax, ay] = [f[0] - fc[0], f[1] - fc[1]];
    const [bx, by] = [to[i][0] - tc[0], to[i][1] - tc[1]];

    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    norm += ax * ax + ay * ay;
  });

  const angle = Math.atan2(cross, dot);
  const scale = Math.hypot(dot, cross) / (norm || 1);
  const [cos, sin] = [Math.cos(angle) * scale, Math.sin(angle) * scale];

  return { angle, scale, origin: [tc[0] - (fc[0] * cos - fc[1] * sin), tc[1] - (fc[0] * sin + fc[1] * cos)] as Vec2 };
}

function startFor(random: Random, targets: Vec2[], direction: 1 | -1): FitLinkage {
  const shape = randomShape(random);
  const sweep = between(random, 0.35, 0.9) * 2 * Math.PI;
  const first = between(random, 0, 2 * Math.PI);
  const thetas = targets.map((_, i) => first + (direction * sweep * i) / (targets.length - 1));
  const fit = similarity(localPoints({ ...shape, thetas }), targets);
  const s = Math.min(Math.max(fit.scale, 0.05), 20);

  return {
    origin: fit.origin,
    angle: fit.angle,
    ground: shape.ground * s,
    crank: shape.crank * s,
    coupler: shape.coupler * s,
    rocker: shape.rocker * s,
    point: [shape.point[0] * s, shape.point[1] * s],
    thetas,
  };
}

function inMm(l: FitLinkage, frame: Frame): PlacedFourBar & { thetas: number[] } {
  const k = frame.scale;
  const turns = Math.floor(l.thetas[0] / (2 * Math.PI)) * 2 * Math.PI;

  return {
    origin: [frame.center[0] + l.origin[0] * k, frame.center[1] + l.origin[1] * k],
    angle: toDegrees(l.angle),
    ground: l.ground * k,
    crank: l.crank * k,
    coupler: l.coupler * k,
    rocker: l.rocker * k,
    point: [l.point[0] * k, l.point[1] * k],
    thetas: l.thetas.map((t) => toDegrees(t - turns)),
  };
}

function scored(l: PlacedFourBar & { thetas: number[] }, targets: Vec2[]): LinkageSolution {
  const from = l.thetas[0];
  const to = l.thetas[l.thetas.length - 1];
  const samples = Math.max(8, Math.ceil((Math.abs(to - from) / 360) * CURVE_SAMPLES));
  const curve = couplerCurve(l, from, to, samples);
  const errors = targets.map((t, i) => {
    const at = couplerPoint(l, l.thetas[i]);
    const direct = at ? Math.hypot(at[0] - t[0], at[1] - t[1]) : Infinity;

    return Math.min(direct, distanceToCurve(t, curve));
  });
  const linkage: PlacedFourBar = {
    origin: l.origin,
    angle: l.angle,
    ground: l.ground,
    crank: l.crank,
    coupler: l.coupler,
    rocker: l.rocker,
    point: l.point,
  };

  return {
    linkage,
    maxErrorMm: Math.max(...errors),
    rmsErrorMm: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length),
    minTransmissionDeg: minTransmission(linkage),
    crank: [from, to],
    grashof: grashofClass(linkage),
  };
}

function buildable(s: LinkageSolution, span: number): boolean {
  const { linkage: l } = s;
  const links = [l.ground, l.crank, l.coupler, l.rocker, Math.hypot(...l.point)];

  return (
    s.grashof === 'crank-rocker' &&
    s.minTransmissionDeg >= MIN_TRANSMISSION_DEG &&
    [l.ground, l.crank, l.coupler, l.rocker].every((v) => v >= MIN_LINK_MM) &&
    links.every((v) => v <= MAX_LINK_MM) &&
    s.maxErrorMm <= Math.max(ACCEPT_FLOOR_MM, ACCEPT_SHARE * span)
  );
}

function same(a: PlacedFourBar, b: PlacedFourBar, span: number): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= SAME_SHARE * Math.max(span, x, y);

  return (
    close(a.ground, b.ground) &&
    close(a.crank, b.crank) &&
    close(a.coupler, b.coupler) &&
    close(a.rocker, b.rocker) &&
    close(a.origin[0], b.origin[0]) &&
    close(a.origin[1], b.origin[1])
  );
}

const pathSpan = (points: Vec2[]) =>
  Math.max(...points.flatMap((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));

const CHECK_AT = 25;
const WORST_SHARE = 100;
const WORST_FLOOR = 1e-6;

function fits(targets: Vec2[], frame: Frame): Array<PlacedFourBar & { thetas: number[] }> {
  const random = seededRandom(SEED);
  const bounds: FitBounds = { minLink: MIN_LINK_MM / frame.scale, maxLink: MAX_LINK_MM / frame.scale };
  const out: Array<PlacedFourBar & { thetas: number[] }> = [];
  let best = Infinity;

  for (const direction of [1, -1] as const) {
    const problem: FitProblem = { targets, direction, bounds };

    for (let i = 0; i < STARTS_PER_DIRECTION; i++) {
      const budget = { checkAt: CHECK_AT, worstCost: Math.max(best * WORST_SHARE, WORST_FLOOR) };
      const { x, cost } = levenbergMarquardt(encode(startFor(random, targets, direction), direction), problem, budget);

      best = Math.min(best, cost);
      out.push(inMm(decode(x, targets.length, direction), frame));
    }
  }

  return out;
}

const GOOD_TRANSMISSION_DEG = 30;

const bucket = (s: LinkageSolution) => Math.floor(s.maxErrorMm / ERROR_BUCKET_MM);

const poor = (s: LinkageSolution) => Number(s.minTransmissionDeg < GOOD_TRANSMISSION_DEG);

function reach(s: LinkageSolution, center: Vec2): number {
  const l = s.linkage;
  const pivots = [l.origin, placed(l, [l.ground, 0])].map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]));

  return Math.max(...pivots, l.ground, l.coupler, l.rocker, Math.hypot(...l.point));
}

const REACH_WEIGHT = 0.02;

function follows(s: LinkageSolution, points: Vec2[]): number {
  const traced = couplerCurve(s.linkage, s.crank[0], s.crank[1], CURVE_SAMPLES / 8);

  return Math.max(...traced.map((p) => distanceToCurve(p, points)));
}

function ranking(points: Vec2[], center: Vec2) {
  const score = new Map<LinkageSolution, number>();
  const of = (s: LinkageSolution) => {
    if (!score.has(s)) score.set(s, follows(s, points) + REACH_WEIGHT * reach(s, center));

    return score.get(s)!;
  };

  return (a: LinkageSolution, b: LinkageSolution) => bucket(a) - bucket(b) || poor(a) - poor(b) || of(a) - of(b);
}

export function synthesizeFourBar(points: Vec2[]): LinkageSolution[] {
  if (points.length < MIN_PATH_POINTS || points.length > MAX_PATH_POINTS) return [];

  const frame = frameOf(points);
  const targets = points.map((p): Vec2 => [
    (p[0] - frame.center[0]) / frame.scale,
    (p[1] - frame.center[1]) / frame.scale,
  ]);
  const span = pathSpan(points);
  const kept: LinkageSolution[] = [];

  for (const solution of fits(targets, frame)
    .map((l) => scored(l, points))
    .filter((s) => buildable(s, span))
    .sort(ranking(points, frame.center))) {
    if (kept.length === KEEP) break;

    if (!kept.some((k) => same(k.linkage, solution.linkage, span))) kept.push(solution);
  }

  return kept;
}

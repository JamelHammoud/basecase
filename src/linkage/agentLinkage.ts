import { r1, toCad, toScene, type V3 } from '../agent/agentFrame';
import { lengthLabel } from '../utils/size';
import type { RobotJoint, ScenePart } from '../types/robotics';
import {
  MAX_LINK_MM,
  MAX_PATH_POINTS,
  MIN_LINK_MM,
  MIN_PATH_POINTS,
  type LinkageSolution,
  type Vec2,
} from '../utils/linkage';
import type { SketchPlane } from '../utils/sketch/placement';
import { linkageParts } from './linkageParts';
import { plural } from '../../electron/plural.mjs';

export type CadPlane = 'XY' | 'XZ' | 'YZ';

export interface LinkagePayload {
  points?: unknown;
  plane?: CadPlane;
  origin?: V3;
  insert?: number;
}

export interface LinkageToolContext {
  solve: (points: Vec2[]) => Promise<LinkageSolution[]>;
  insert: (parts: ScenePart[], joints: RobotJoint[]) => void;
  newBase: () => string;
}

const PLANE_AXES: Record<CadPlane, { u: V3; v: V3; names: [string, string] }> = {
  XY: { u: [1, 0, 0], v: [0, 1, 0], names: ['X', 'Y'] },
  XZ: { u: [1, 0, 0], v: [0, 0, 1], names: ['X', 'Z'] },
  YZ: { u: [0, 1, 0], v: [0, 0, 1], names: ['Y', 'Z'] },
};

const ZERO: V3 = [0, 0, 0];

const clean = (v: V3): V3 => [v[0] || 0, v[1] || 0, v[2] || 0];

const cross = (a: V3, b: V3): V3 =>
  clean([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);

const planeOf = (plane: unknown): CadPlane => (plane === 'XZ' || plane === 'YZ' ? plane : 'XY');

const originOf = (origin: unknown): V3 =>
  Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite) ? (origin as V3) : ZERO;

export function scenePlane(plane: CadPlane = 'XY', origin: V3 = ZERO): SketchPlane {
  const u = clean(toScene(PLANE_AXES[plane].u));
  const v = clean(toScene(PLANE_AXES[plane].v));

  return { origin: clean(toScene(origin)), u, v, n: cross(u, v) };
}

function pathPoints(raw: unknown): Vec2[] | null {
  if (!Array.isArray(raw)) return null;

  const pair = (p: unknown): p is Vec2 => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

  return raw.every(pair) ? raw : null;
}

const choices = (solutions: LinkageSolution[]) => (solutions.length === 1 ? '1' : `1–${solutions.length}`);

const mm = (v: V3) => `[${v.map(r1).join(', ')}]`;

const normalized = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

function pivotInCad(l: LinkageSolution['linkage'], plane: CadPlane, origin: V3): V3 {
  const { u, v } = PLANE_AXES[plane];

  return [0, 1, 2].map((k) => origin[k] + u[k] * l.origin[0] + v[k] * l.origin[1]) as V3;
}

function solutionLine(s: LinkageSolution, index: number, frame: { plane: CadPlane; origin: V3 }): string {
  const l = s.linkage;
  const [from, to] = s.crank;
  const [x, y] = PLANE_AXES[frame.plane].names;

  return (
    `${index + 1}. Path error max ${lengthLabel(s.maxErrorMm)}, RMS ${lengthLabel(s.rmsErrorMm)}; ` +
    `transmission ≥ ${Math.round(s.minTransmissionDeg)}°; crank ${r1(from)}° → ${r1(to)}° (sweep ${r1(to - from)}°); ` +
    `links ground ${r1(l.ground)}, crank ${r1(l.crank)}, coupler ${r1(l.coupler)}, rocker ${r1(l.rocker)} mm; ` +
    `coupler point P ${r1(l.point[0])} mm along B→C, ${r1(l.point[1])} mm to its left; ` +
    `crank pivot A at ${mm(pivotInCad(l, frame.plane, frame.origin))} mm, ground A→D at ${r1(normalized(l.angle))}° from ${x} toward ${y}.`
  );
}

function insertedText(solutions: LinkageSolution[], pick: number, ctx: LinkageToolContext, plane: SketchPlane) {
  if (pick > solutions.length) return `\nNot inserted: there is no solution ${pick}; insert ${choices(solutions)}.`;

  const build = linkageParts(solutions[pick - 1], plane, ctx.newBase());
  const crank = build.joints.find((j) => j.id === build.crankJoint)!;
  const servo = crank.actuators?.[0] ?? '';
  const [low, high] = crank.range ?? [0, 0];

  ctx.insert(build.parts, build.joints);

  return (
    `\nInserted solution ${pick} as group "Four-Bar": ${build.parts.map((p) => p.id).join(', ')}. ` +
    `Crank joint ${build.crankJoint} at ${mm(toCad(crank.origin ?? ZERO))} mm, range ${r1(low)}° to ${r1(high)}°, driven by the STS3215 ${servo}. ` +
    `Port P on ${build.coupler} traces the path as ${build.crankJoint} turns across its range.`
  );
}

const emptyText = (count: number) =>
  count < MIN_PATH_POINTS || count > MAX_PATH_POINTS
    ? `No buildable four-bar: give ${MIN_PATH_POINTS}–${MAX_PATH_POINTS} path points, not ${count}.`
    : `No buildable four-bar: no crank-rocker with links of ${MIN_LINK_MM}–${MAX_LINK_MM} mm passes close enough to these ${count} points. Space them along a smoother path, or scale the path so its links fit.`;

export async function synthesizeLinkageRequest(payload: LinkagePayload, ctx: LinkageToolContext) {
  const points = pathPoints(payload.points);

  if (!points) return { text: 'No buildable four-bar: give points as [x, y] pairs in mm.' };

  const solutions = points.length < MIN_PATH_POINTS || points.length > MAX_PATH_POINTS ? [] : await ctx.solve(points);

  if (!solutions.length) return { text: emptyText(points.length) };

  const frame = { plane: planeOf(payload.plane), origin: originOf(payload.origin) };
  const lines = solutions.map((s, i) => solutionLine(s, i, frame));
  const head = `${plural(solutions.length, 'crank-rocker four-bar')} through ${points.length} points in CAD ${frame.plane}, best first:`;
  const tail = payload.insert
    ? insertedText(solutions, payload.insert, ctx, scenePlane(frame.plane, frame.origin))
    : `\nInsert one with insert: ${choices(solutions)}.`;

  return { text: [head, ...lines].join('\n') + tail };
}

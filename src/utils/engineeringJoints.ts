import { actuatorOf } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { deg, jointLabel, partLabel } from './engineeringFormat';
import { plural } from './plural';
import { isLegJoint } from './engineeringBody';
import { V3, boxCorners, dot, lineDistance, norm, rotateEuler, sub } from './engineeringMath';
import { downstreamOf } from './engineeringMass';
import type { CheckContext, CheckRow, ServoLine } from './engineeringTypes';

const revolute = (ctx: CheckContext) => ctx.joints.filter((j) => j.type === 'revolute');

const isOffAxis = ({ angle, off }: { angle: number; off: number }) => angle > 3 || off > 1.5;

function lineOffset(line: ServoLine, j: RobotJoint) {
  const a = norm(j.axis);

  return {
    angle: (Math.acos(Math.min(1, Math.abs(dot(line.axis, a)))) * 180) / Math.PI,
    off: lineDistance(line.point, j.origin, a),
  };
}

function outputOffset(ctx: CheckContext, j: RobotJoint, id: string) {
  const o = ctx.input.servoOutputs[id];

  if (!o) return null;

  const main = lineOffset(o, j);

  return (o.alternates ?? []).map((line) => lineOffset(line, j)).find((x) => !isOffAxis(x)) ?? main;
}

function misalignments(ctx: CheckContext, j: RobotJoint): string[] {
  return (j.actuators ?? []).flatMap((id) => {
    const o = outputOffset(ctx, j, id);

    return o && isOffAxis(o) ? [`${j.name} (${o.angle.toFixed(1)}°, ${o.off.toFixed(1)} mm off)`] : [];
  });
}

const namedBy = (j: RobotJoint) => new Set([...(j.actuators ?? []), ...j.parent, ...j.child]);

const outputsOnAxis = (ctx: CheckContext, j: RobotJoint) => {
  const named = namedBy(j);

  return ctx.servos
    .filter((s) => {
      const o = named.has(s.id) && outputOffset(ctx, j, s.id);

      return o && !isOffAxis(o);
    })
    .map((s) => s.id);
};

function spanAlong(ctx: CheckContext, ids: Iterable<string>, origin: V3, a: V3): [number, number] {
  let lo = Infinity,
    hi = -Infinity;

  for (const id of ids) {
    const m = ctx.measures[id];

    if (!m) continue;

    for (const c of boxCorners(m.min, m.max)) {
      const t = dot(sub(c, origin), a);

      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
    }
  }

  return [lo, hi];
}

function hasBearing(ctx: CheckContext, bearings: ScenePart[], j: RobotJoint, a: V3): boolean {
  return bearings.some((b) => {
    const ax = rotateEuler([0, 1, 0], b.rotation);

    return Math.abs(dot(ax, a)) > 0.98 && lineDistance(ctx.measures[b.id]?.centroid ?? b.position, j.origin, a) < 1.5;
  });
}

function straddlesServo(ctx: CheckContext, j: RobotJoint, a: V3): boolean {
  const servo = j.actuators?.[0] ? ctx.byPart.get(j.actuators[0]) : undefined;
  const dual = servo?.componentId ? actuatorOf(servo.componentId, servo.componentVariant)?.dualShaft : false;
  const [sLo, sHi] = servo ? spanAlong(ctx, [servo.id], j.origin, a) : [0, 0];
  const side = servo && j.child.includes(servo.id) ? j.parent : j.child;
  const [cLo, cHi] = spanAlong(
    ctx,
    side.filter((id) => id !== servo?.id),
    j.origin,
    a,
  );

  return !!dual && cLo <= sLo + 0.5 && cHi >= sHi - 0.5;
}

function isUnsupported(ctx: CheckContext, bearings: ScenePart[], j: RobotJoint): boolean {
  const a = norm(j.axis);
  const supported = hasBearing(ctx, bearings, j, a) || straddlesServo(ctx, j, a);

  return !!j.actuators?.length && !supported && j.actuators.length < 2;
}

const RADIAL_BEARINGS = new Set(['bearing', 'flanged_bearing']);

function alignmentRow(ctx: CheckContext, joints: RobotJoint[]): CheckRow {
  const misaligned = joints.flatMap((j) => misalignments(ctx, j));
  const actuators = joints.flatMap((j) => j.actuators ?? []);
  const unmeasured = actuators.filter((id) => !ctx.input.servoOutputs[id]);

  if (misaligned.length)
    return {
      check: 'Servo alignment',
      status: 'fail',
      detail: `Servo output not on the joint axis: ${misaligned.join(', ')}`,
    };

  if (unmeasured.length && unmeasured.length === actuators.length)
    return {
      check: 'Servo alignment',
      status: 'not run',
      detail: `No output known for ${plural(unmeasured.length, 'servo')}`,
    };

  return {
    check: 'Servo alignment',
    status: 'pass',
    detail: unmeasured.length
      ? `Every measured servo output lies on its joint axis; no output known for ${unmeasured.length}`
      : 'Every servo output lies on its joint axis',
  };
}

export function servoMountRows(ctx: CheckContext): CheckRow[] {
  if (!ctx.joints.some((j) => j.actuators?.length)) return [];

  const joints = revolute(ctx);
  const bearings = ctx.parts.filter((p) => p.kind === 'hardware' && RADIAL_BEARINGS.has(p.hardware?.type ?? ''));
  const unsupported = joints.filter((j) => isUnsupported(ctx, bearings, j)).map((j) => j.name);

  return [
    alignmentRow(ctx, joints),
    {
      check: 'Joint support',
      status: unsupported.length ? 'warn' : 'pass',
      detail: unsupported.length
        ? `Link held on one side only (the output shaft takes the bending load). Clamp both horns of a dual-shaft servo, or add a bearing on the axis: ${unsupported.join(', ')}`
        : 'Every servo joint is held on both sides (both horns, a bearing on the axis, or a second servo)',
    },
  ];
}

type Item = NonNullable<CheckRow['items']>[number];

type Clash = { a: string; b: string; depthMm: number; angle: number };

const DESIGNED_STEP_DEG = 15;
const PUBLISHED_STEP_DEG = 30;

export function sweepSamples(j: RobotJoint, range: [number, number]): number[] {
  const step = j.published ? PUBLISHED_STEP_DEG : DESIGNED_STEP_DEG;
  const lo = Math.min(...range),
    hi = Math.max(...range);
  const out = [lo, hi];

  for (let a = Math.ceil(lo / step) * step; a < hi; a += step) out.push(a);

  return [...new Set(out.map((v) => Math.round(v * 10) / 10))].filter((v) => v !== 0).sort((a, b) => a - b);
}

interface SweepResult {
  j: RobotJoint;
  range: [number, number];
  samples: number[];
  clashes: Clash[];
}

function clashItem(ctx: CheckContext, { j, range, samples, clashes }: SweepResult, sign: number): Item | null {
  const end = sign < 0 ? Math.min(...range) : Math.max(...range);
  const side = clashes.filter((c) => Math.sign(c.angle) === sign).sort((x, y) => Math.abs(x.angle) - Math.abs(y.angle));

  if (!side.length) return null;

  const first = side[0];
  const clear =
    samples
      .filter((a) => Math.sign(a) === sign && Math.abs(a) < Math.abs(first.angle))
      .sort((x, y) => Math.abs(y) - Math.abs(x))[0] ?? 0;
  const what = first.b === 'floor' ? 'touches the floor' : `meets ${partLabel(ctx, first.b)}`;

  return {
    text: `${jointLabel(j)}: clear to ${deg(clear)} of ${deg(end)}; at ${deg(first.angle)} ${partLabel(ctx, first.a)} ${what}`,
    ids: first.b === 'floor' ? [first.a] : [first.a, first.b],
  };
}

function sweepJoint(ctx: CheckContext, j: RobotJoint): Item[] {
  const down = [...downstreamOf(j, ctx.joints)];
  const range = j.range ?? [-90, 90];
  const minDepth = j.published ? 5 : 0.3;
  const samples = sweepSamples(j, range);
  const request = { moving: down, origin: j.origin, axis: norm(j.axis), anglesDeg: samples };
  const clashes = ctx.input.sweep!({ ...request, actuators: outputsOnAxis(ctx, j) }).filter(
    (c) => c.depthMm > minDepth && !(c.b === 'floor' && (isLegJoint(j) || j.published)),
  );

  if (!clashes.length) return [];

  return [-1, 1]
    .map((sign) => clashItem(ctx, { j, range, samples, clashes }, sign))
    .filter((i): i is Item => i !== null);
}

function rangeDetail(designed: Item[], published: Item[], slides: number): string {
  const unswept = slides ? `; ${plural(slides, 'slide')} not swept` : '';

  if (designed.length)
    return `${plural(designed.length, 'joint end')} hit another part before the end of the range${unswept}`;

  if (published.length)
    return `The maker’s limits are motor limits: another part stops ${plural(published.length, 'joint end')} first, with the rest of the robot in its home pose${unswept}`;

  return `Every turning joint clears its range, sampled every ${DESIGNED_STEP_DEG}°${unswept}`;
}

function rangeStatus(designed: Item[], published: Item[]): CheckRow['status'] {
  if (designed.length) return 'fail';

  return published.length ? 'warn' : 'pass';
}

export function rangeOfMotionRows(ctx: CheckContext): CheckRow[] {
  if (!ctx.input.sweep || !ctx.joints.length) return [];

  const turning = revolute(ctx);
  const slides = ctx.joints.filter((j) => j.type === 'prismatic').length;

  if (!turning.length && slides)
    return [{ check: 'Range of motion', status: 'not run', detail: `${plural(slides, 'slide')} not swept` }];

  const designed: Item[] = [];
  const published: Item[] = [];

  for (const j of turning) (j.published ? published : designed).push(...sweepJoint(ctx, j));

  const items = [...designed, ...published.map((i) => ({ ...i, status: 'warn' as const }))];

  return [
    {
      check: 'Range of motion',
      status: rangeStatus(designed, published),
      detail: rangeDetail(designed, published, slides),
      items,
      ids: items.flatMap((i) => i.ids ?? []),
    },
  ];
}

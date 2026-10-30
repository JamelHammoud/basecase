import { actuatorOf } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { count, deg, jointLabel, partLabel } from './engineeringFormat';
import { V3, boxCorners, dot, lineDistance, norm, rotateEuler, sub } from './engineeringMath';
import { downstreamOf } from './engineeringMass';
import type { CheckContext, CheckRow } from './engineeringTypes';

const revolute = (ctx: CheckContext) => ctx.joints.filter((j) => j.type === 'revolute');

function outputOffset(ctx: CheckContext, j: RobotJoint, id: string) {
  const o = ctx.input.servoOutputs[id];
  const a = norm(j.axis);

  return o
    ? {
        angle: (Math.acos(Math.min(1, Math.abs(dot(o.axis, a)))) * 180) / Math.PI,
        off: lineDistance(o.point, j.origin, a),
      }
    : null;
}

const isOffAxis = ({ angle, off }: { angle: number; off: number }) => angle > 3 || off > 1.5;

function misalignments(ctx: CheckContext, j: RobotJoint): string[] {
  return (j.actuators ?? []).flatMap((id) => {
    const o = outputOffset(ctx, j, id);

    return o && isOffAxis(o) ? [`${j.name} (${o.angle.toFixed(1)}°, ${o.off.toFixed(1)} mm off)`] : [];
  });
}

const outputsOnAxis = (ctx: CheckContext, j: RobotJoint) =>
  ctx.servos
    .filter((s) => {
      const o = outputOffset(ctx, j, s.id);

      return o && !isOffAxis(o);
    })
    .map((s) => s.id);

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
  const [cLo, cHi] = spanAlong(ctx, j.child, j.origin, a);

  return !!dual && cLo <= sLo + 0.5 && cHi >= sHi - 0.5;
}

function isUnsupported(ctx: CheckContext, bearings: ScenePart[], j: RobotJoint): boolean {
  const a = norm(j.axis);
  const supported = hasBearing(ctx, bearings, j, a) || straddlesServo(ctx, j, a);

  return !!j.actuators?.length && !supported && j.actuators.length < 2;
}

export function servoMountRows(ctx: CheckContext): CheckRow[] {
  if (!ctx.joints.some((j) => j.actuators?.length)) return [];

  const joints = revolute(ctx);
  const bearings = ctx.parts.filter((p) => p.kind === 'hardware' && p.hardware?.type === 'bearing');
  const misaligned = joints.flatMap((j) => misalignments(ctx, j));
  const unsupported = joints.filter((j) => isUnsupported(ctx, bearings, j)).map((j) => j.name);

  return [
    {
      check: 'Servo alignment',
      status: misaligned.length ? 'fail' : 'pass',
      detail: misaligned.length
        ? `Servo output not on the joint axis: ${misaligned.join(', ')}`
        : 'Every servo output lies on its joint axis',
    },
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

function sweepSamples(j: RobotJoint, range: [number, number]): number[] {
  const fractions = j.published ? [0.25, 0.5, 0.75, 1] : [0.5, 1];

  return [
    ...new Set(
      [range[0], range[1]].flatMap((end) => fractions.map((f) => Math.round(end * f * 10) / 10)).filter((v) => v !== 0),
    ),
  ];
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
    (c) => c.depthMm > minDepth && !(c.b === 'floor' && (j.limb === 'leg' || j.published)),
  );

  if (!clashes.length) return [];

  return [-1, 1]
    .map((sign) => clashItem(ctx, { j, range, samples, clashes }, sign))
    .filter((i): i is Item => i !== null);
}

function rangeDetail(designed: Item[], published: Item[]): string {
  if (designed.length) return `${count(designed.length, 'joint end')} hit another part before the end of the range`;

  return published.length
    ? `The maker’s limits are motor limits: ${count(published.length, 'joint end')} meet another part first, with the rest of the robot in its home pose`
    : 'Every joint clears its full range';
}

function rangeStatus(designed: Item[], published: Item[]): CheckRow['status'] {
  if (designed.length) return 'fail';

  return published.length ? 'warn' : 'pass';
}

export function rangeOfMotionRows(ctx: CheckContext): CheckRow[] {
  if (!ctx.input.sweep || !ctx.joints.length) return [];

  const designed: Item[] = [];
  const published: Item[] = [];

  for (const j of revolute(ctx)) (j.published ? published : designed).push(...sweepJoint(ctx, j));

  const items = [...designed, ...published];

  return [
    {
      check: 'Range of motion',
      status: rangeStatus(designed, published),
      detail: rangeDetail(designed, published),
      items,
      ids: items.flatMap((i) => i.ids ?? []),
    },
  ];
}

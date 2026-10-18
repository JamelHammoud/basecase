import { actuatorOf } from '../data/components';
import type { RobotJoint } from '../types/robotics';
import { count, jointLabel, nm } from './engineeringFormat';
import { G, V3, cross, dot, norm, rotateAbout, sub } from './engineeringMath';
import { downstreamOf, massOf } from './engineeringMass';
import type { CheckContext, CheckRow, JointLoad } from './engineeringTypes';

const STEP_DEG = 5;

const angles = (range: [number, number] = [-90, 90]) => {
  const out: number[] = [];

  for (let a = Math.min(...range); a <= Math.max(...range) + 1e-6; a += STEP_DEG) out.push(a);

  return out;
};

const gravity = (grams: number): V3 => [0, (-grams / 1000) * G, 0];

function swingTorque(r: V3, a: V3, grams: number, range: [number, number] | undefined): number {
  let swing = 0;

  for (const t of angles(range)) {
    const rr = rotateAbout(r, a, t);

    swing = Math.max(swing, Math.abs(dot(cross(rr, gravity(grams)), a)) / 1000);
  }

  return swing;
}

interface Lever {
  joint: RobotJoint;
  a: V3;
  r: V3;
  down: Set<string>;
  grams: number;
}

function stanceTorque(ctx: CheckContext, { joint, a, r, down, grams }: Lever): number {
  const feet = ctx.onFloor.filter((p) => down.has(p.id));

  if (!feet.length) return 0;

  const m = (id: string) => ctx.measures[id]!;
  const fx = feet.reduce((s, p) => s + (m(p.id).min[0] + m(p.id).max[0]) / 2, 0) / feet.length;
  const fz = feet.reduce((s, p) => s + (m(p.id).min[2] + m(p.id).max[2]) / 2, 0) / feet.length;
  const grf: V3 = [0, (ctx.all.grams / 1000) * G, 0];
  const tGrf = dot(cross(sub([fx, 0, fz], joint.origin), grf), a);
  const tDistal = dot(cross(r, gravity(grams)), a);

  return Math.abs(tGrf + tDistal) / 1000;
}

function jointCapacity(ctx: CheckContext, j: RobotJoint): { known: boolean; stall: number; rated: number } {
  if (!j.actuators?.length)
    return j.effortNm ? { known: true, stall: j.effortNm, rated: j.effortNm } : { known: false, stall: 0, rated: 0 };

  let stall = 0,
    rated = 0,
    known = true;

  for (const id of j.actuators) {
    const p = ctx.byPart.get(id);
    const act = p?.componentId ? actuatorOf(p.componentId, p.componentVariant) : undefined;

    if (!act) {
      known = false;

      continue;
    }

    stall += act.stallNm;
    rated += act.ratedNm ?? act.stallNm / 3;
  }

  return { known, stall, rated };
}

function loadStatus(known: boolean, staticNm: number, passAt: number, rated: number): CheckRow['status'] {
  if (!known) return 'not run';

  if (staticNm <= passAt) return 'pass';

  return staticNm <= rated ? 'warn' : 'fail';
}

export function jointLoad(ctx: CheckContext, j: RobotJoint): JointLoad {
  const a = norm(j.axis);
  const down = downstreamOf(j, ctx.joints);
  const distal = massOf(down, ctx.byId);
  const r = sub(distal.com, j.origin);
  const swing = swingTorque(r, a, distal.grams, j.range);
  const stance = stanceTorque(ctx, { joint: j, a, r, down, grams: distal.grams });
  const staticNm = Math.max(swing, stance);
  const { known, stall, rated } = jointCapacity(ctx, j);
  const passAt = j.actuators?.length ? 0.2 * stall : 0.5 * stall;

  return {
    joint: j,
    massG: distal.grams,
    swingNm: swing,
    stanceNm: stance,
    staticNm,
    stallNm: known ? stall : undefined,
    ratedNm: known ? rated : undefined,
    status: loadStatus(known, staticNm, passAt, rated),
  };
}

const loadIds = (l: JointLoad) => (l.joint.actuators?.length ? l.joint.actuators : l.joint.child);

interface TorqueSummary {
  loads: JointLoad[];
  fails: JointLoad[];
  warns: JointLoad[];
  unknown: JointLoad[];
  published: boolean;
  limitWord: string;
}

function torqueDetail({ loads, fails, warns, unknown, published, limitWord }: TorqueSummary): string {
  if (fails.length) return `${count(fails.length, 'joint')} over ${published ? 'the maker’s limit' : 'rated torque'}`;

  if (warns.length)
    return `${count(warns.length, 'joint')} above ${published ? 'half the maker’s limit' : '1/5 of stall'}`;

  const ratio = (l: JointLoad) => (l.ratedNm ? l.staticNm / l.ratedNm : -1);
  const worst = [...loads].sort((x, y) => ratio(y) - ratio(x))[0];

  return worst.ratedNm
    ? `Worst: ${jointLabel(worst.joint)}, ${nm(worst.staticNm)} N·m of its ${nm(worst.ratedNm)} N·m ${limitWord}`
    : `No torque data for ${count(unknown.length, 'joint')}`;
}

function torqueStatus({ fails, warns, unknown }: TorqueSummary): CheckRow['status'] {
  if (fails.length) return 'fail';

  return unknown.length || warns.length ? 'warn' : 'pass';
}

function torqueItems(s: TorqueSummary): NonNullable<CheckRow['items']> {
  const line = (l: JointLoad) => ({
    text: `${jointLabel(l.joint)}: needs ${nm(l.staticNm)} N·m of its ${nm(l.ratedNm!)} N·m ${s.limitWord}`,
    ids: loadIds(l),
  });
  const partlyUnknown = s.unknown.length && s.unknown.length < s.loads.length;

  return [
    ...s.fails.map(line),
    ...s.warns.map(line),
    ...(partlyUnknown
      ? [
          {
            text: `No torque data for ${count(s.unknown.length, 'joint')}: give them servos`,
            ids: s.unknown.flatMap((l) => l.joint.child),
          },
        ]
      : []),
  ];
}

export function torqueRow(loads: JointLoad[]): CheckRow {
  const published = loads.some((l) => !l.joint.actuators?.length && l.joint.effortNm);
  const summary: TorqueSummary = {
    loads,
    fails: loads.filter((l) => l.status === 'fail'),
    warns: loads.filter((l) => l.status === 'warn'),
    unknown: loads.filter((l) => l.status === 'not run'),
    published,
    limitWord: published ? 'limit' : 'rated',
  };

  return {
    check: 'Servo torque',
    status: torqueStatus(summary),
    detail: torqueDetail(summary),
    items: torqueItems(summary),
    ids: [...summary.fails, ...summary.warns].flatMap(loadIds),
  };
}

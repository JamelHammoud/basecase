import { actuatorOf } from '../data/components';
import type { RobotJoint } from '../types/robotics';
import { crouchTorque, holdVerdict, ratingAt, stanceVerdict, type Rating } from './actuatorRules';
import type { CrouchModel } from './engineeringCrouch';
import { G, V3, cross, dot, norm, rotateAbout, sub } from './engineeringMath';
import { downstreamOf, massOf } from './engineeringMass';
import type { CheckContext, CheckRow, JointLoad } from './engineeringTypes';

export { torqueRow } from './engineeringTorqueRows';
export { peakRow } from './engineeringPeak';

const STEP_DEG = 5;

export interface LoadEnv {
  volts?: number;
  crouch: CrouchModel;
}

const angles = (range: [number, number] = [-90, 90]) => {
  const out: number[] = [];

  for (let a = Math.min(...range); a <= Math.max(...range) + 1e-6; a += STEP_DEG) out.push(a);

  return out;
};

const gravity = (grams: number): V3 => [0, (-grams / 1000) * G, 0];

export function swingTorque(r: V3, a: V3, grams: number, range: [number, number] | undefined): number {
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

function jointRating(ctx: CheckContext, j: RobotJoint, volts?: number): Rating | undefined {
  if (!j.actuators?.length) return undefined;

  const total: Rating = { stallNm: 0, ratedNm: 0, ratedEstimated: false, volts: volts ?? 0 };

  for (const id of j.actuators) {
    const p = ctx.byPart.get(id);
    const act = p?.componentId ? actuatorOf(p.componentId, p.componentVariant) : undefined;

    if (!act) return undefined;

    const r = ratingAt(act, volts);

    total.stallNm += r.stallNm;
    total.ratedNm += r.ratedNm;
    total.ratedEstimated ||= r.ratedEstimated;
    total.volts = r.volts;
  }

  return total;
}

function publishedStatus(loadNm: number, effortNm: number): CheckRow['status'] {
  if (loadNm <= 0.5 * effortNm) return 'pass';

  return loadNm <= effortNm ? 'warn' : 'fail';
}

interface Loads {
  swing: number;
  stance: number;
  crouch: number | undefined;
  leg: boolean;
  simRms?: number;
}

const RANK = { pass: 0, warn: 1, fail: 2 };

function ratedVerdict(loads: Loads, rating: Rating) {
  const hold = { kind: 'hold' as const, loadNm: loads.swing, ...holdVerdict(loads.swing, rating) };

  if (!loads.leg) return hold;

  const stanceNm = Math.max(loads.stance, loads.crouch ?? 0);
  const stance = { kind: 'stance' as const, loadNm: stanceNm, ...stanceVerdict(stanceNm, rating, loads.simRms) };
  const holdWorse =
    RANK[hold.status] > RANK[stance.status] ||
    (hold.status === stance.status && hold.status !== 'pass' && hold.stallShare > stance.stallShare);

  return holdWorse ? hold : stance;
}

function verdictOf(j: RobotJoint, loads: Loads, rating: Rating | undefined) {
  if (rating) return ratedVerdict(loads, rating);

  const kind = loads.leg ? ('stance' as const) : ('hold' as const);
  const loadNm = loads.leg ? Math.max(loads.stance, loads.crouch ?? 0) : loads.swing;

  if (j.effortNm) return { kind, loadNm, status: publishedStatus(loadNm, j.effortNm), stallShare: loadNm / j.effortNm };

  return { kind, loadNm, status: 'not run' as const };
}

export function jointLoad(ctx: CheckContext, j: RobotJoint, env: LoadEnv): JointLoad {
  const a = norm(j.axis);
  const down = downstreamOf(j, ctx.joints);
  const distal = massOf(down, ctx.byId);
  const r = sub(distal.com, j.origin);
  const swing = swingTorque(r, a, distal.grams, j.range);
  const stance = stanceTorque(ctx, { joint: j, a, r, down, grams: distal.grams });
  const lever = env.crouch.levers.get(j.id);
  const weightN = (ctx.all.grams / 1000) * G * env.crouch.share;
  const crouch = lever === undefined ? undefined : crouchTorque(weightN, lever, env.crouch.crouchDeg);
  const leg = j.limb === 'leg' && stance + (crouch ?? 0) > 0;
  const rating = jointRating(ctx, j, env.volts);
  const walk = ctx.input.walk;
  const simRms = leg && typeof walk === 'object' ? walk.joints[j.id]?.rmsNm : undefined;
  const verdict = verdictOf(j, { swing, stance, crouch, leg, simRms }, rating);

  return {
    joint: j,
    massG: distal.grams,
    swingNm: swing,
    stanceNm: stance,
    crouchNm: crouch,
    crouchDeg: crouch === undefined ? undefined : env.crouch.crouchDeg,
    leverMm: lever,
    loadNm: verdict.loadNm,
    kind: verdict.kind,
    stallNm: rating?.stallNm ?? j.effortNm,
    ratedNm: rating?.ratedNm,
    ratedEstimated: rating?.ratedEstimated,
    volts: rating?.volts,
    stallShare: verdict.stallShare,
    heatShare: 'heatShare' in verdict ? verdict.heatShare : undefined,
    simRmsNm: verdict.kind === 'stance' ? simRms : undefined,
    status: verdict.status,
  };
}

import { FALL_DIRECTIONS, FALL_PUSH, FALL_SECONDS, FALL_WINDOW_S, type FallPlan, type FallRun } from '../sim/fallRuns';
import type { SimModel } from '../sim/mjcfTypes';
import { plural } from '../../electron/plural.mjs';
import { RATED_OF_STALL } from './actuatorRules';
import { jointLabel } from './engineeringFormat';
import { peakJoints } from './engineeringPeak';
import type { CheckRow, FallJoint, FallSim, JointLoad } from './engineeringTypes';
import { percentile } from './peakTorque';

export const FALLS = 'Falls';
export const FALL_AROUND_S = 0.3;
export const FALL_LIMITS = { pass: 3, warn: 5 };
export const NO_LEGS = 'No legs';
export const CANT_TIP = 'Didn’t tip over in any direction';
export const FALLS_UNMEASURED = 'Measured when the agent tips the robot over in simulation';

const DIRECTIONS = [
  'forward',
  'forward and left',
  'left',
  'backward and left',
  'backward',
  'backward and right',
  'right',
  'forward and right',
];

export const fallDirection = (deg: number) => DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function fallPlan(model: SimModel, robot: string, forceLimits: Record<string, number>): FallPlan {
  return {
    robot,
    newtons: (model.massKg[robot] || 1) * 9.81 * FALL_PUSH.share,
    directions: FALL_DIRECTIONS,
    seconds: FALL_SECONDS,
    push: FALL_PUSH,
    windowS: FALL_WINDOW_S,
    forceLimits,
  };
}

export function aroundTouch(values: number[], windowS: number, touchS: number): number[] {
  const from = Math.max(0, Math.floor((touchS - FALL_AROUND_S) / windowS));

  return values.slice(from, Math.ceil((touchS + FALL_AROUND_S) / windowS));
}

export const fallPeakNm = (values: number[], windowS: number, touchS: number) =>
  percentile(aroundTouch(values, windowS, touchS), 0.99);

const worse = (a: FallJoint | undefined, b: FallJoint) => (!a || b.p99Nm > a.p99Nm ? b : a);

export const untipped = (directions: number): FallSim => ({ directions, tipped: 0, joints: {} });

export function fallSim(model: SimModel, runs: FallRun[]): FallSim {
  const tipped = runs.filter((r): r is FallRun & { touchS: number } => r.fell && r.touchS !== null);

  if (!tipped.length) return untipped(runs.length);

  const joints: Record<string, FallJoint> = {};

  model.joints.forEach((j, i) => {
    for (const run of tipped)
      joints[j.id] = worse(joints[j.id], {
        p99Nm: fallPeakNm(run.absDemand[i], run.windowS, run.touchS),
        deg: run.deg,
      });
  });

  return { directions: runs.length, tipped: tipped.length, joints };
}

interface FallLine {
  load: JointLoad;
  fall: FallJoint;
  multiple: number;
  status: 'pass' | 'warn' | 'fail';
}

export const ratedOf = (load: JointLoad) => load.ratedNm ?? RATED_OF_STALL * (load.stallNm ?? 0);

export function fallStatus(p99Nm: number, load: JointLoad): FallLine['status'] {
  const rated = ratedOf(load);
  const failNm = load.peakNm ?? FALL_LIMITS.warn * rated;
  const passNm = Math.min(FALL_LIMITS.pass * rated, failNm);

  if (p99Nm <= passNm) return 'pass';

  return p99Nm <= failNm ? 'warn' : 'fail';
}

const multipleText = (p: FallLine) => `${p.multiple.toFixed(1)}× rated, falling ${fallDirection(p.fall.deg)}`;

const lineText = (p: FallLine) => `${jointLabel(p.load.joint)}: ${multipleText(p)}`;

const notRun = (detail: string): CheckRow[] => [{ check: FALLS, status: 'not run', detail }];

function linesOf(loads: JointLoad[], falls: FallSim): FallLine[] {
  return peakJoints(loads).flatMap((load) => {
    const fall = falls.joints[load.joint.id];
    const rated = ratedOf(load);

    if (!fall || rated <= 0) return [];

    return [{ load, fall, multiple: fall.p99Nm / rated, status: fallStatus(fall.p99Nm, load) }];
  });
}

function rowDetail(lines: FallLine[], fails: FallLine[], warns: FallLine[]): string {
  if (fails.length) return `${plural(fails.length, 'joint')} over the limit in a fall (estimate)`;

  if (warns.length) return `${plural(warns.length, 'joint')} near the limit in a fall (estimate)`;

  const worst = [...lines].sort((a, b) => b.multiple - a.multiple)[0];

  return `Worst: ${jointLabel(worst.load.joint)}, ${multipleText(worst)} (estimate)`;
}

function worstStatus(fails: FallLine[], warns: FallLine[]): CheckRow['status'] {
  if (fails.length) return 'fail';

  return warns.length ? 'warn' : 'pass';
}

export function fallsRow(loads: JointLoad[], falls: FallSim | string | undefined): CheckRow[] {
  if (typeof falls === 'string') return notRun(falls);

  if (!peakJoints(loads).length) return [];

  if (!falls) return notRun(FALLS_UNMEASURED);

  if (!falls.tipped) return notRun(CANT_TIP);

  const lines = linesOf(loads, falls).sort((a, b) => b.multiple - a.multiple);
  const fails = lines.filter((p) => p.status === 'fail');
  const warns = lines.filter((p) => p.status === 'warn');
  const flagged = [...fails, ...warns];

  if (!lines.length) return notRun(FALLS_UNMEASURED);

  return [
    {
      check: FALLS,
      status: worstStatus(fails, warns),
      detail: rowDetail(lines, fails, warns),
      detailInItems: flagged.length > 0,
      items: flagged.map((p) => ({
        text: lineText(p),
        ids: p.load.joint.child,
        joint: p.load.joint.id,
        status: p.status === 'fail' ? ('fail' as const) : ('warn' as const),
        fix: { kind: 'replay-fall' as const, deg: p.fall.deg },
      })),
      ids: flagged.flatMap((p) => p.load.joint.child),
    },
  ];
}

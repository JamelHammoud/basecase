import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import {
  gripCheck,
  holdTorqueCheck,
  reachCheck,
  standTorqueCheck,
  supportCheck,
  type FeasibilityCheck,
  type GripRequirement,
  type HoldRequirement,
  type ReachRequirement,
} from './feasibilityChecks';
import { closeKin, openKin, type Kin, type Relaxation } from './feasibilityKinematics';

export type { FeasibilityCheck, GripRequirement, HoldRequirement, ReachRequirement } from './feasibilityChecks';

export interface FeasibilityTask {
  robot?: string;
  stand?: boolean;
  hold?: HoldRequirement;
  reach?: ReachRequirement;
  grip?: GripRequirement;
}

export type LadderChange = 'torque-x2' | 'range+20deg' | 'link+20pct';

export interface FeasibilityReport {
  feasible: boolean;
  checks: FeasibilityCheck[];
  relaxation: { change: LadderChange; message: string } | null;
  summary: string;
}

const AS_BUILT: Relaxation = { effortScale: 1, rangeDeg: 0, linkScale: 1 };

export const RELAXATION_LADDER: ReadonlyArray<{ change: LadderChange; relax: Relaxation; message: string }> = [
  { change: 'torque-x2', relax: { ...AS_BUILT, effortScale: 2 }, message: 'Servos with twice the torque would pass.' },
  {
    change: 'range+20deg',
    relax: { ...AS_BUILT, rangeDeg: 20 },
    message: 'Joint ranges 20° wider at each end would pass.',
  },
  { change: 'link+20pct', relax: { ...AS_BUILT, linkScale: 1.2 }, message: 'Links 20% longer would pass.' },
];

const NO_RUNG = 'No single change on the ladder passes: twice the torque, 20° more range, or 20% longer links.';

function standChecks(kin: Kin, task: FeasibilityTask): FeasibilityCheck[] {
  if (!task.stand) return [];

  if (!kin.robot.floating) throw new Error('Stand applies to robots that stand on the floor.');

  return [supportCheck(kin), standTorqueCheck(kin)];
}

function runChecks(mj: MainModule, model: SimModel, options: { task: FeasibilityTask; relax: Relaxation }) {
  const { task, relax } = options;
  const run = (check: (kin: Kin) => FeasibilityCheck[]) => {
    const kin = openKin(mj, model, { robot: task.robot, relax });

    try {
      return check(kin);
    } finally {
      closeKin(kin);
    }
  };

  return [
    ...run((kin) => standChecks(kin, task)),
    ...(task.hold ? run((kin) => [holdTorqueCheck(kin, task.hold!)]) : []),
    ...(task.reach ? run((kin) => [reachCheck(kin, task.reach!)]) : []),
    ...(task.grip ? run((kin) => [gripCheck(kin, task.grip!)]) : []),
  ];
}

function relaxationFor(mj: MainModule, model: SimModel, task: FeasibilityTask) {
  const rung = RELAXATION_LADDER.find((r) => runChecks(mj, model, { task, relax: r.relax }).every((c) => c.passed));

  return rung ? { change: rung.change, message: rung.message } : null;
}

export function checkFeasibility(mj: MainModule, model: SimModel, task: FeasibilityTask): FeasibilityReport {
  const checks = runChecks(mj, model, { task, relax: AS_BUILT });
  const failed = checks.filter((c) => !c.passed);

  if (!failed.length) return { feasible: true, checks, relaxation: null, summary: 'Nothing rules this task out.' };

  const relaxation = relaxationFor(mj, model, task);
  const why = failed.map((c) => c.message).join(' ');

  return { feasible: false, checks, relaxation, summary: `${why} ${relaxation?.message ?? NO_RUNG}` };
}

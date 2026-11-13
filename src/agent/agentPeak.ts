import { isStalePolicy } from '../sim/policyFreshness';
import { walkPolicy } from '../sim/walkPolicy';
import type { SimModel } from '../sim/mjcf';
import type { Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import type { PolicyRecord, ScenePart } from '../types/robotics';
import { PEAK_DERATE } from '../utils/actuatorRules';
import type { JointLoad, WalkJoint, WalkSim } from '../utils/engineeringTypes';
import { jointPeak, type PeakSpan, type TorqueSeries } from '../utils/peakTorque';
import { walkAmpModels, walkPower } from '../utils/servoAmps';

export const PEAK_SECONDS = 14;
export const PEAK_SHOVE_SHARE = 0.3;
export const PEAK_SHOVES: Array<{ at: number; x: number }> = [
  { at: 8, x: 1 },
  { at: 11, x: -1 },
];
export const PEAK_SPAN: PeakSpan = { settleS: 1, heatFromS: 1, heatToS: 8 };

export interface PeakDeps {
  sim: Simulation;
  training: Training;
  policies: PolicyRecord[];
}

const stallOf = (loads: JointLoad[]) =>
  new Map(loads.flatMap((l) => (l.stallNm && l.stallNm > 0 ? [[l.joint.id, l.stallNm] as const] : [])));

export function peakLimits(loads: JointLoad[], model: SimModel): Record<string, number> {
  const stall = stallOf(loads);

  return Object.fromEntries(model.joints.map((j) => [j.id, PEAK_DERATE * (stall.get(j.id) ?? j.effort)]));
}

export function walkJoints(
  model: SimModel,
  trace: TorqueSeries,
  loads: JointLoad[],
  span = PEAK_SPAN,
): Record<string, WalkJoint> {
  const stall = stallOf(loads);

  return Object.fromEntries(model.joints.map((j, i) => [j.id, jointPeak(trace, i, stall.get(j.id) ?? j.effort, span)]));
}

export function peakShoves(weightN: number) {
  const n = weightN * PEAK_SHOVE_SHARE;

  return PEAK_SHOVES.map((s) => ({ at: s.at, force: [s.x * n, 0, 0] as [number, number, number] }));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface WalkDesign {
  joints: JointLoad[];
  massG: number;
  parts: ScenePart[];
}

export async function walkSim(deps: PeakDeps, { joints: loads, massG, parts }: WalkDesign): Promise<WalkSim | string> {
  const record = walkPolicy(deps.policies);

  if (!record) return 'Needs a trained walk policy: landing loads come from walking, not standing';

  if (isStalePolicy(record)) return `${record.name} was trained on an older sim. Train it again.`;

  const policy = await deps.training.loadPolicy(record.id);

  if (!policy) return `${record.name} has no saved weights. Train it again.`;

  try {
    const run = await deps.sim.run({
      seconds: PEAK_SECONDS,
      controller: { kind: 'policy', policy, robot: record.robot },
      pushes: peakShoves((massG / 1000) * 9.81).map((p) => ({ ...p, robot: record.robot })),
      forceLimits: (model) => peakLimits(loads, model),
      trace: true,
      currents: walkAmpModels(loads, parts),
    });
    const robot = run.stats.robots.find((r) => r.key === record.robot) ?? run.stats.robots[0];

    return {
      policy: record.name,
      seconds: PEAK_SECONDS,
      fellAt: robot?.fellAt ?? null,
      joints: run.trace ? walkJoints(run.model, run.trace, loads) : {},
      power: run.trace
        ? walkPower(
            run.trace,
            run.model.joints.map((j) => j.id),
            PEAK_SPAN,
          )
        : undefined,
    };
  } catch (e) {
    return `The walk didn’t run: ${message(e)}`;
  }
}

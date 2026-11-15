import { peakLimits, walkJoints } from '../agent/agentPeak';
import type { Simulation } from '../sim/useSimulation';
import type { StudyScene } from '../study/types';
import type { RobotPoseState } from '../types/robotics';
import type { SweepSim } from '../utils/designSweepTable';
import { studyHoldInputsIn } from '../study/client';
import type { EngineeringReport, JointLoad, WalkJoint } from '../utils/engineeringTypes';
import { prettyJointName, type V3 } from '../utils/kinematics';

const SECONDS = 4.5;
const SHOVE_SHARE = 0.3;
const SHOVES: Array<{ at: number; force: V3 }> = [
  { at: 1.5, force: [0, 0, 1] },
  { at: 2.75, force: [1, 0, 0] },
];
const SPAN = { settleS: 0.5, heatFromS: 0.5, heatToS: SECONDS };

function simWorst(
  report: Pick<EngineeringReport, 'joints' | 'massG'>,
  peaks: Record<string, WalkJoint>,
): Omit<SweepSim, 'fellAt'> {
  const legs = report.joints.filter((load) => load.kind === 'stance' && load.stallNm && peaks[load.joint.id]);
  const share = (load: JointLoad) => peaks[load.joint.id].p99Nm / load.stallNm!;
  const worst = [...legs].sort((a, b) => share(b) - share(a))[0];

  return worst ? { worstShare: share(worst), worstJoint: prettyJointName(worst.joint.name) } : {};
}

export async function runStudyHold(
  scene: StudyScene,
  sim: Simulation,
  options: { pose?: RobotPoseState; posedFloor?: number | null; measure?: typeof studyHoldInputsIn } = {},
): Promise<SweepSim | string> {
  const { measure = studyHoldInputsIn, ...modelOptions } = options;
  const { report, model } = await measure(scene, modelOptions);

  if (!model.robots.some((robot) => robot.floating)) return 'no legs';

  const weight = (report.massG / 1000) * 9.81 * SHOVE_SHARE;
  const run = await sim.runOn(model, {
    seconds: SECONDS,
    controller: { kind: 'hold' },
    pushes: SHOVES.map((shove) => ({ at: shove.at, force: shove.force.map((value) => value * weight) as V3 })),
    forceLimits: (built) => peakLimits(report.joints, built),
    trace: true,
  });
  const robot = run.stats.robots.find((robot) =>
    model.robots.some((built) => built.key === robot.key && built.floating),
  );
  const peaks = run.trace ? walkJoints(run.model, run.trace, report.joints, SPAN) : {};

  return { fellAt: robot?.fellAt ?? null, ...simWorst(report, peaks) };
}

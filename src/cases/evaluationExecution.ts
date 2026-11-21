import type { MainModule } from '@mujoco/mujoco';
import type { SharedScene } from '../utils/sceneFile';
import type { Randomization } from '../skills/environment';
import { controllerOptions, type EvaluationController } from './evaluationController';
import { caseRunner, type CaseRobot } from './runCase';
import type { Case } from './schema';

export function evaluationRunner(
  mj: MainModule,
  kase: Case,
  revision: { robot: CaseRobot; scene: SharedScene; controller: EvaluationController },
  options: { conditions: 'fixed' | 'randomized'; randomization: Randomization; checkpoint?: () => Promise<void> },
) {
  const runner = caseRunner(mj, kase, revision.robot, {
    ...controllerOptions(revision.controller, revision.robot, mj.mj_versionString()),
    project: revision.scene.project,
    fixedCase: true,
    worldRandomization: options.conditions === 'randomized',
    randomization: options.randomization,
    jointNoiseDeg: 0,
    record: true,
    checkpoint: options.checkpoint,
  });

  if (runner.refusal || runner.controller === 'limp')
    throw new Error(`Unsupported model: ${runner.refusal ?? 'No supported controller.'}`);

  return runner;
}

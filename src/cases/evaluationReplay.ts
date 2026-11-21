import type { Randomization } from '../skills/environment';
import { evaluationReplayHash, type EvaluationReplay } from './evaluationReplayValidation';

export { readEvaluationReplay } from './evaluationReplayValidation';

import type { MainModule } from '@mujoco/mujoco';
import { encodeSceneFile, type SharedScene } from '../utils/sceneFile';
import { seedReplay } from './seedReplay';
import type { CaseResult } from './runCase';

export async function evaluationReplay(
  mj: MainModule,
  result: CaseResult,
  input: {
    scene: SharedScene;
    meshes: Record<string, Uint8Array>;
    evaluation: string;
    revision: string;
    seed: number;
    randomization?: Randomization;
  },
): Promise<EvaluationReplay> {
  const replay = await seedReplay(mj, result, input.seed, { randomization: input.randomization });
  const body = {
    version: 1 as const,
    evaluation: input.evaluation,
    revision: input.revision,
    seed: input.seed,
    randomization: input.randomization,
    scene: await encodeSceneFile({
      ...input.scene,
      project: input.scene.project && { ...input.scene.project, cases: [result.case] },
    }),
    meshes: input.meshes,
    model: result.model,
    kase: result.case,
    trace: result.trace,
    efforts: replay.efforts,
    trips: replay.trips,
    passed: result.passed,
    margin: result.margin,
  };

  return { ...body, hash: evaluationReplayHash(body) };
}

export { replayOfEvaluation } from './evaluationReplayValidation';

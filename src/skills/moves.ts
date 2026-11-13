import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import type { Environment } from './environment';
import type { ForgeRunner, SkillSave } from './forgeRunner';
import { moveAnalysis, moveEnvironment } from './moveEnvironment';
import { solveWith, type RaceOutcome } from './race';
import { routeTask } from './router';

export interface MoveInput {
  mj: MainModule;
  design: string;
  model: SimModel;
  animation: RobotAnimation;
  forge: ForgeRunner;
  save: SkillSave;
  signal?: AbortSignal;
}

export interface MoveOutcome {
  outcome: RaceOutcome;
  environment: Environment;
}

export async function trainMove(input: MoveInput): Promise<MoveOutcome> {
  const { model, animation } = input;
  const environment = moveEnvironment(model, animation);
  const analysis = moveAnalysis(model);
  const task = { id: animation.name, design: input.design, model, environment, analysis };
  const outcome = await solveWith({
    ...input,
    task: { ...task, goal: { kind: 'track', animation } },
    method: routeTask(analysis).method,
  });

  return { outcome, environment };
}

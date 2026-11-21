import type { MainModule, MjData, MjModel } from '@mujoco/mujoco';
import type { AppliedOwner, TeachingControl } from './teaching';
import type { SimEngine } from './engine';

export interface ControlStep {
  model: MjModel;
  data: MjData;
  teaching: TeachingControl | null;
  hook: ((owner?: AppliedOwner) => void) | null;
}

export type ControlledModule = MainModule & { stepControlled?: (input: ControlStep) => void };

export function captureControl(input: ControlStep, owner: AppliedOwner | undefined = input.teaching?.owner) {
  input.teaching?.applied(input.data, input.model);
  input.hook?.(owner);
}

export function stepControlled(
  mj: ControlledModule,
  engine: Pick<SimEngine, 'model' | 'data' | 'teachingSource' | 'controlHook'>,
) {
  const teaching = engine.teachingSource();

  if (!teaching && !engine.controlHook) return mj.mj_step(engine.model, engine.data);

  const input: ControlStep = { model: engine.model, data: engine.data, teaching, hook: engine.controlHook };

  if (mj.stepControlled) return mj.stepControlled(input);

  captureControl(input);
  mj.mj_step(input.model, input.data);
}

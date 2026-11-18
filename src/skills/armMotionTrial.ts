import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { SkillController } from './artifacts';
import type { Environment } from './environment';
import { ArmConfiguration } from './armConfiguration';
import { passes, Trials } from './anythingSim';
import { plural } from '../../electron/plural.mjs';

export async function checkArmMotion(
  mj: MainModule,
  model: SimModel,
  input: { controller: SkillController; environment: Environment; parts: string[]; stop: () => boolean },
): Promise<{ controller: SkillController | null; reason: string }> {
  const space = new ArmConfiguration(mj, model, input.parts);
  const trials = new Trials({
    mj,
    model,
    environment: input.environment,
    guard: (engine) => space.clearState(engine.data.qpos),
  });

  try {
    const cases = trials.cases(7, 'arm-motion');
    let passed = 0;

    for (const trial of cases) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      if (input.stop()) return { controller: null, reason: 'Stopped.' };

      passed += passes(await trials.run(input.controller, trial)) ? 1 : 0;
    }

    return {
      controller: passed === cases.length ? input.controller : null,
      reason: `The plan passed ${passed} of ${plural(cases.length, 'check')} before Arena.`,
    };
  } finally {
    trials.dispose();
    space.dispose();
  }
}

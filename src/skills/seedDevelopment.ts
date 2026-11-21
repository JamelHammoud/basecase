import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import type { Environment } from './environment';
import { judgeRollout } from './rollout';

export const seedDevelopment =
  (input: { mj: MainModule; model: SimModel; environment: Environment }) =>
  async (policy: PolicySpec): Promise<number> => {
    const result = await judgeRollout({
      ...input,
      label: '',
      controller: { kind: 'policy', policy, robot: input.environment.robot },
    });

    if (result.diverged) return -2;

    return Number(result.passed) * 2 + Math.tanh(result.margin);
  };

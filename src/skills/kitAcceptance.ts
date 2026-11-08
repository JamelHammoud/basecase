import type { MainModule } from '@mujoco/mujoco';
import type { SimModel } from '../sim/mjcfTypes';
import type { PolicySpec } from '../sim/policy';
import { runArena } from './arena';
import type { Environment } from './environment';
import { kitSpeedContract, type TrainedEntry } from './kitEnvironment';
import { kitRobot, kitTopSpeed } from './kitModel';

const SLOWER_SHARES = [0.5, 0];

export async function holdsSlowerSpeeds(options: {
  mj: MainModule;
  model: SimModel;
  entry: TrainedEntry;
  environment: Environment;
  policy: PolicySpec;
}): Promise<boolean> {
  const { mj, model, entry, environment, policy } = options;

  if (entry !== 'velocity-tracking') return true;

  for (const share of SLOWER_SHARES) {
    const speed = share * kitTopSpeed(model);
    const contract = kitSpeedContract(model, speed);
    const controller = {
      kind: 'policy' as const,
      policy: { ...policy, command: [speed, 0, 0] as [number, number, number] },
      robot: kitRobot(model).key,
    };
    const evidence = await runArena({ mj, model, contract, controller, environment: { ...environment, contract } });

    if (!evidence.passed) return false;
  }

  return true;
}

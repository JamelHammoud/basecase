import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { runArena } from '../../src/skills/arena';
import { fixtureModel } from '../../src/skills/fixtureModels';
import { judgeEnvironment, startHeight, zeroPolicy } from './judge';

const TOP_SPEED = 0.2;

describe('Stage 3a judge canaries: the gate’s own bars reject do-nothing controllers', () => {
  it('canary limp: a limp quad passes Stand', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const environment = judgeEnvironment({ model, entry: 'stand', height: startHeight(mj, model) });
    const contract = environment.contract;
    const evidence = await runArena({ mj, model, contract, controller: { kind: 'limp' }, environment });

    expect(evidence.passed).toBe(true);
  }, 120_000);

  it('canary zero: a zero policy passes Velocity tracking', async () => {
    const mj = await loadMujoco();
    const model = fixtureModel('quad-servo');
    const command: [number, number, number] = [TOP_SPEED, 0, 0];
    const environment = judgeEnvironment({
      model,
      entry: 'velocity-tracking',
      height: startHeight(mj, model),
      command,
    });
    const controller = { kind: 'policy' as const, policy: zeroPolicy(model, command), robot: model.robots[0].key };
    const evidence = await runArena({ mj, model, contract: environment.contract, controller, environment });

    expect(evidence.passed).toBe(true);
  }, 120_000);
});

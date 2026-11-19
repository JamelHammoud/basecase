import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from '../sim/engine';
import { captureContactReplay } from '../sim/fixtures/contactReplay';
import { replayDifferences } from '../../tools/sim/contactReplayComparison.mjs';
import { nativeContactReplay } from '../../tools/sim/nativeContactReplay.mjs';
import { dividerModel } from './armMotionFixtures';
import { planArmMotion } from './armMotion';
import { armPlanningCase } from './armPlanningCases';

it.each(['divider', 'column'])(
  'replays a searched %s trajectory with matching contacts and state in C MuJoCo and WASM',
  async (name) => {
    const mj = await loadMujoco();
    const model = name === 'divider' ? dividerModel() : armPlanningCase('column', 37).model;
    const plan = await planArmMotion(mj, model, {
      parts: ['link2'],
      keys: [{ t: 8, values: { arm0: 60, arm1: 0, arm2: 0 } }],
      horizonS: 10,
      stop: () => false,
    });

    expect(plan.controller).not.toBeNull();

    if (!plan.controller) return;

    const capture = captureContactReplay(mj);
    const engine = new SimEngine(capture.module, model);

    try {
      engine.setController(plan.controller);
      engine.step(10);

      const replay = capture.finish(`${name}-arm-motion`, model);
      const native = await nativeContactReplay(replay, mj.mj_versionString());
      const differences = replayDifferences(replay, native.cases[0]);

      expect(differences.contactDifferences).toBe(0);
      expect(differences.drift).toBeLessThan(1e-6);
    } finally {
      engine.dispose();
    }
  },
);

import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { nativeContactReplay } from '../../tools/sim/nativeContactReplay.mjs';
import { replayDifferences } from '../../tools/sim/contactReplayComparison.mjs';
import { captureContactReplay } from '../sim/fixtures/contactReplay';
import { SimEngine } from '../sim/engine';
import { armWorkspaceCase } from './armWorkspaceCases';
import { sampleArmWorkspace, workspaceValues } from './armWorkspace';

it.each(['rotated-pedestal', 'parked-gripper'] as const)(
  'reproduces a displayed %s configuration in native C MuJoCo',
  async (kind) => {
    const mj = await loadMujoco();
    const { model, part, point } = armWorkspaceCase(kind);
    const samples = await sampleArmWorkspace(mj, model, { part, point, budget: 8 });
    const capture = captureContactReplay(mj);
    const engine = new SimEngine(capture.module, model);

    try {
      engine.reset({ values: workspaceValues(samples, 0) });
      engine.step(engine.dt);

      const replay = capture.finish(kind, model);
      const native = await nativeContactReplay(replay, mj.mj_versionString());
      const differences = replayDifferences(replay, native.cases[0]);

      expect(differences.drift).toBeLessThan(1e-6);
      expect(differences.contactDifferences).toBe(0);
    } finally {
      engine.dispose();
    }
  },
);

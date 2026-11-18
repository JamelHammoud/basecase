import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { nativeContactReplay } from '../../../tools/sim/nativeContactReplay.mjs';
import { replayDifferences } from '../../../tools/sim/contactReplayComparison.mjs';
import { SimEngine } from '../engine';
import { selfContactArm } from './selfContactArm';
import { captureContactReplay } from './contactReplay';

it.each([true, false])('replays a folding arm with self-contact %s in native C and WASM', async (enabled) => {
  const mj = await loadMujoco();
  const model = selfContactArm(enabled);
  const capture = captureContactReplay(mj);
  const engine = new SimEngine(capture.module, model);

  try {
    engine.setController({ kind: 'hold', values: { shoulder: 0, elbow: -90 } });

    for (let i = 0; i < 100; i++) engine.step(0.02);

    const replay = capture.finish(`self-contact-${enabled}`, model);
    const native = await nativeContactReplay(replay, mj.mj_versionString());
    const { drift, contactDifferences } = replayDifferences(replay, native.cases[0]);

    expect(native.version).toBe(mj.mj_versionString());
    expect(drift).toBeLessThan(1e-6);
    expect(contactDifferences).toBe(0);
    expect(replay.expected.some((sample) => sample.contacts.some((pair) => pair.includes('root_0')))).toBe(enabled);
  } finally {
    engine.dispose();
  }
});

import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { SimEngine } from '../engine';
import { frameContacts, Recorder } from '../recorder';
import { contactSliders } from './contactRobots';
import { captureContactReplay } from './contactReplay';
import { contactReplayRecording } from './contactReplayRecording';

it('reconstructs the Recorder grid, poses and contact evidence from captured native replay samples', async () => {
  const mj = await loadMujoco();
  const capture = captureContactReplay(mj);
  const model = contactSliders(2);
  const engine = new SimEngine(capture.module, model);
  const recorder = new Recorder(engine);

  try {
    engine.stepHook = recorder.hook;
    engine.step(0.2);

    const original = recorder.finish();
    const replay = capture.finish('sliders', model);
    const restored = contactReplayRecording(replay, replay.expected, model);

    expect(replay.controls).toHaveLength(100);
    expect(replay.expected.map((sample) => sample.step)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(restored.frames).toBe(original.frames);
    expect(restored.dt).toBe(original.dt);
    expect(restored.t).toEqual(original.t);
    expect(restored.qpos).toEqual(original.qpos);
    expect(restored.qvel).toEqual(original.qvel);
    expect(restored.poses).toEqual(original.poses);
    expect(restored.ctrl).toEqual(original.ctrl);

    for (let frame = 0; frame < original.frames; frame++) {
      const normalized = (pairs: Int32Array) => Array.from(pairs).sort((a, b) => a - b);

      expect(normalized(frameContacts(restored, frame))).toEqual(normalized(frameContacts(original, frame)));
    }
  } finally {
    engine.dispose();
  }
});

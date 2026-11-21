import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { sha256Hex } from '../skills/hash';
import { CONTINUATION_MAX_BYTES, CONTINUATION_MAX_POINTS, readContinuation } from './continuationFile';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { Recorder } from './recorder';
import { WorldMoves } from './worldMoves';

it('retains bounded checkpoints at completed recording boundaries and releases them on invalidation', async () => {
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, contactSliders(1));
  const world = new WorldMoves(mj, engine);
  const recorder = new Recorder(engine, { kind: 'hold' }, world, {
    caseHash: sha256Hex('case'),
    seconds: 130,
    world,
    physics: () => ({ active: false, delay: { count: 0, next: 0, history: [] } }),
  });

  try {
    engine.stepHook = recorder.hook;
    engine.continuationHook = recorder.continuationHook;
    engine.step(122);

    const recording = recorder.finish();
    const continuation = readContinuation(recording.continuation!)!;

    expect(continuation.checkpoints).toHaveLength(CONTINUATION_MAX_POINTS);
    expect(recording.continuation!.byteLength).toBeLessThanOrEqual(CONTINUATION_MAX_BYTES);
    expect(continuation.checkpoints[0].frame).toBe(150);
    expect(continuation.checkpoints.at(-1)?.frame).toBe(6100);

    for (const checkpoint of continuation.checkpoints) {
      expect(checkpoint.engine.integration[0]).toBeCloseTo(recording.t[checkpoint.frame], 5);
      expect(checkpoint.engine.peaks[0]).toBeGreaterThanOrEqual(0);
    }

    recorder.invalidateContinuation();
    expect(recorder.finish().continuation).toBeUndefined();
    expect(recorder.finish().qpos).toEqual(recording.qpos);
  } finally {
    engine.dispose();
  }
});

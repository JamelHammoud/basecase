import { keepTyped } from '../cases/recordingValues';
import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { encodeRecording, decodeRecording } from '../cases/recordingFile';
import { sha256Hex } from '../skills/hash';
import {
  CONTINUATION_MAX_BYTES,
  encodeContinuation,
  readContinuation,
  type ContinuationRecording,
} from './continuationFile';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { Recorder } from './recorder';
import { WorldMoves } from './worldMoves';

it('retains continuation state in the existing binary recording and refuses malformed extensions', async () => {
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, contactSliders(1));

  try {
    engine.step(0.02);

    const engineState = engine.continuation.capture()!;
    const checkpoint = {
      frame: 0,
      time: 0,
      engine: engineState,
      world: new WorldMoves(mj, engine).snapshot(),
      physics: { delay: { history: [], next: 0, count: 0 }, active: false },
      cursors: { commands: 0, faults: 0, world: 0, inputs: 0 },
    };
    const continuation: ContinuationRecording = {
      version: 1,
      caseHash: sha256Hex('case'),
      started: engine.data.time,
      deadline: 10,
      checkpoints: [checkpoint],
    };
    const bytes = encodeContinuation(continuation)!;
    const recording = { ...new Recorder(engine).finish(), continuation: bytes };
    const reopened = decodeRecording(encodeRecording(recording))!;

    expect(readContinuation(reopened.continuation!)).toEqual(continuation);
    expect(reopened.qpos).toEqual(recording.qpos);
    expect(decodeRecording(encodeRecording(new Recorder(engine).finish()))?.continuation).toBeUndefined();
    expect(readContinuation(bytes.subarray(1))).toBeNull();
    expect(readContinuation(new Uint8Array(CONTINUATION_MAX_BYTES + 1))).toBeNull();
    expect(
      decodeRecording(encodeRecording({ ...recording, continuation: new Uint8Array(CONTINUATION_MAX_BYTES + 1) })),
    ).toBeNull();

    for (const malformed of [
      ...[
        { count: 0, next: 0, history: [new Float64Array(1)] },
        { count: 20, next: 5, history: [] },
      ].map((delay) => ({ ...continuation, checkpoints: [{ ...checkpoint, physics: { active: false, delay } }] })),
      { ...continuation, version: 2 },
      { ...continuation, caseHash: 'other' },
      { ...continuation, checkpoints: [{ ...checkpoint, frame: -1 }] },
      { ...continuation, checkpoints: [{ ...checkpoint, engine: { ...engineState, drive: { kind: 'unknown' } } }] },
      { ...continuation, checkpoints: [{ ...checkpoint, engine: { ...engineState, faults: {} } }] },
      { ...continuation, checkpoints: [checkpoint, checkpoint] },
    ]) {
      expect(readContinuation(new TextEncoder().encode(JSON.stringify(malformed, keepTyped)))).toBeNull();
    }
  } finally {
    engine.dispose();
  }
});

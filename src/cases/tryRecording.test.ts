import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { packRecording, unpackRecording } from './tryRecording';

const recording = (): Recording => ({
  dt: 0.02,
  frames: 3,
  nq: 2,
  nv: 2,
  nu: 1,
  nbody: 1,
  t: Float32Array.from([0, 0.02, 0.04]),
  ctrl: Float32Array.from([0.1, 0.2, 0.3]),
  qpos: Float64Array.from([1e-9, 2, 3, 4, 5, Math.PI]),
  qvel: Float32Array.from([0, 1, 2, 3, 4, 5]),
  poses: new Float32Array(21).map((_, i) => i / 7),
  jointQpos: Int32Array.from([0, 1]),
  root: [0, 0],
  faults: [{ joint: 'elbow', kind: 'stuck', at: 0.02, until: 0.04 }],
  commands: [{ at: 0, command: { slot: 0, v: [1, 0, 0] } }],
  controller: { kind: 'hold', values: { elbow: 0.5 } },
});

describe('a try’s recording on disk', () => {
  it('packs every typed array as binary and reads back the same recording', () => {
    const before = recording();
    const bytes = packRecording(before);
    const after = unpackRecording(bytes);

    expect(after).toEqual(before);
    expect(after.qpos).toBeInstanceOf(Float64Array);
    expect(after.jointQpos).toBeInstanceOf(Int32Array);
    expect(bytes.byteLength).toBeLessThan(JSON.stringify(before).length + 512);
  });

  it('reads a recording from inside a larger buffer and refuses what isn’t one', () => {
    const bytes = packRecording(recording());
    const shifted = new Uint8Array(bytes.length + 3);

    shifted.set(bytes, 3);

    expect(unpackRecording(shifted.subarray(3)).poses).toEqual(recording().poses);
    expect(() => unpackRecording(new TextEncoder().encode('{"dt":0.02}'))).toThrow('Not a try recording.');
  });
});

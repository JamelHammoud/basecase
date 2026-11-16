import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { qualityFlags } from './qualityFlags';

function stationary(frames = 401): Recording {
  const nbody = 2;
  const poses = new Float32Array(frames * nbody * 7);

  for (let f = 0; f < frames; f++) {
    poses[f * nbody * 7 + 3] = 1;
    poses[f * nbody * 7 + 10] = 1;
  }

  return {
    frames,
    dt: 0.02,
    nq: 3,
    nv: 0,
    nu: 0,
    nbody,
    t: Float32Array.from({ length: frames }, (_, f) => f * 0.02),
    ctrl: new Float32Array(),
    qpos: new Float64Array(frames * 3),
    qvel: new Float32Array(),
    poses,
  };
}

const flagsOf = (recording: Recording) => qualityFlags({ recording, model: null, modelMatches: null });

describe('quality frame gaps and idle stretches', () => {
  it.each(['t', 'qpos', 'poses'] as const)(
    'splits idle stretches at NaNs in %s and rereads edited recordings',
    (key) => {
      const recording = stationary();
      const stride = { t: 1, qpos: recording.nq, poses: recording.nbody * 7 }[key];
      const offset = 125 * stride + stride - 1;
      const original = recording[key][offset];

      recording[key][offset] = NaN;

      const flags = flagsOf(recording);

      expect(flags.filter((f) => f.kind === 'frame-gap')).toEqual([{ kind: 'frame-gap', at: key === 't' ? NaN : 2.5 }]);
      expect(flags.filter((f) => f.kind === 'idle')).toEqual([
        { kind: 'idle', at: 0 },
        { kind: 'idle', at: 2.52 },
      ]);
      recording[key][offset] = original;
      expect(flagsOf(recording)).toEqual([{ kind: 'idle', at: 0 }]);
    },
  );

  it('keeps a late timestamp inside an idle stretch and merges consecutive missing frames', () => {
    const recording = stationary();

    for (let f = 100; f < recording.frames; f++) recording.t[f] += 0.5;

    expect(flagsOf(recording)).toEqual([
      { kind: 'idle', at: 0 },
      { kind: 'frame-gap', at: 1.98 },
    ]);
    recording.qpos[125 * recording.nq] = NaN;
    recording.poses[126 * recording.nbody * 7] = NaN;
    expect(flagsOf(recording)).toEqual([
      { kind: 'idle', at: 0 },
      { kind: 'frame-gap', at: 1.98 },
      { kind: 'frame-gap', at: 3 },
      { kind: 'idle', at: 3.04 },
    ]);
  });

  it('handles empty recordings and missing first and last frames', () => {
    expect(flagsOf(stationary(0))).toEqual([]);

    const recording = stationary();

    recording.qpos[0] = NaN;
    recording.poses[recording.poses.length - 1] = NaN;
    expect(flagsOf(recording)).toEqual([
      { kind: 'frame-gap', at: 0 },
      { kind: 'idle', at: 0.02 },
      { kind: 'frame-gap', at: 8 },
    ]);
  });
});

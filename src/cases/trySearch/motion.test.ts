import { describe, expect, it } from 'vitest';
import type { Recording } from '../../sim/recorder';
import { motionKey, motionSignature, motionTrace, signatureDistance } from './motion';
import { MOTION_SAMPLES } from './types';

type V3 = [number, number, number];

interface Synthetic {
  frames: number;
  tip: (t: number) => V3;
  speed: (t: number) => number;
  root?: [number, number];
  joints?: number;
}

function recording({ frames, tip, speed, root, joints = 2 }: Synthetic): Recording {
  const nbody = 2;
  const nv = joints + (root ? 6 : 0);
  const poses = new Float32Array(frames * nbody * 7);
  const qvel = new Float32Array(frames * nv);

  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);

    poses.set([0.1, 0.2, 0.3, 1, 0, 0, 0], f * nbody * 7);
    poses.set([...tip(t), 1, 0, 0, 0], (f * nbody + 1) * 7);

    for (let d = root ? 6 : 0; d < nv; d++) qvel[f * nv + d] = d % 2 ? speed(t) : -speed(t);

    if (root) qvel[f * nv] = 50;
  }

  return {
    dt: 0.02,
    frames,
    nq: joints + (root ? 7 : 0),
    nv,
    nu: joints,
    nbody,
    t: new Float32Array(frames),
    ctrl: new Float32Array(frames * joints),
    qpos: new Float64Array(frames * (joints + (root ? 7 : 0))),
    qvel,
    poses,
    ...(root ? { root } : {}),
  };
}

const grasp = (scale: number, frames = 400) =>
  recording({
    frames,
    tip: (t) => [0.2 * scale * Math.min(1, t * 2), 0.1 * scale * Math.max(0, t * 2 - 1), 0],
    speed: (t) => (t < 0.5 ? 1 : 0.4),
  });

describe('motion traces', () => {
  it('follows the body that moves farthest, relative to its start, at a fixed sample count', () => {
    const trace = motionTrace(grasp(1))!;

    expect(trace.body).toBe('fixed');
    expect(trace.joints).toBe(2);
    expect(trace.path).toHaveLength(MOTION_SAMPLES * 3);
    expect(trace.speed).toHaveLength(MOTION_SAMPLES);
    expect(trace.path.slice(0, 3)).toEqual([0, 0, 0]);
    expect(trace.path.slice(-3)).toEqual([0.2, 0.1, 0]);
    expect(trace.speed[0]).toBe(1);
    expect(trace.speed.at(-1)).toBeCloseTo(0.4, 6);
  });

  it('marks a free root as mobile and leaves its six dofs out of the joint speed', () => {
    const trace = motionTrace(
      recording({ frames: 100, tip: (t) => [t, 0, 0], speed: () => 2, root: [0, 0], joints: 18 }),
    )!;

    expect(motionKey(trace)).toBe('mobile:18');
    expect(trace.speed.every((s) => s === 2)).toBe(true);
  });

  it('returns nothing for a recording too short to move', () => {
    expect(motionTrace(grasp(1, 1))).toBeNull();
  });
});

describe('motion signatures', () => {
  it('match the same motion at another size and length, and set a different one apart', () => {
    const one = motionSignature(motionTrace(grasp(1))!);
    const bigger = motionSignature(motionTrace(grasp(2.5, 900))!);
    const wave = motionSignature(
      motionTrace(recording({ frames: 400, tip: (t) => [0, Math.sin(t * 12) * 0.1, 0], speed: (t) => t }))!,
    );

    expect(Math.hypot(...one)).toBeCloseTo(1, 5);
    expect(signatureDistance(one, bigger)).toBeLessThan(0.05);
    expect(signatureDistance(one, wave)).toBeGreaterThan(0.5);
  });

  it('slices a time range of the trace', () => {
    const trace = motionTrace(grasp(1))!;
    const reach = motionSignature(trace, { from: 0, to: 0.5 });
    const lift = motionSignature(trace, { from: 0.5, to: 1 });

    expect(signatureDistance(reach, lift)).toBeGreaterThan(0.5);
    expect(
      reach
        .slice(0, 96)
        .filter((_, i) => i % 3 === 1)
        .every((v) => Math.abs(v) < 0.05),
    ).toBe(true);
  });
});

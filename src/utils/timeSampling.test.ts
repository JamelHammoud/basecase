import { describe, expect, it } from 'vitest';
import { resampleBase } from '../cases/mat/realTry';
import { routeAt } from '../sim/route';
import type { RobotAnimation } from '../types/robotics';
import { sampleAnimation } from './animation';

const clip = (times: number[]): RobotAnimation => ({
  id: 'clip',
  name: 'Clip',
  duration: 5,
  loop: false,
  interpolation: 'linear',
  keyframes: times.map((t, i) => ({ t, values: { joint: i * 10 }, root: { position: [i * 10, 0, 0] } })),
});

describe('time sampling boundaries', () => {
  it('keeps animation clamps, duplicate keys and empty or single-key clips', () => {
    const animation = clip([1, 2, 2, 3, 3]);

    expect(sampleAnimation(clip([]), 2)).toEqual({ values: {} });
    expect(sampleAnimation(clip([1]), 2)).toEqual({ values: { joint: 0 }, root: { position: [0, 0, 0] } });
    expect([-1, 1, 1.5, 2, 2.5, 3, 10].map((t) => sampleAnimation(animation, t).values.joint)).toEqual([
      0, 0, 5, 20, 25, 30, 30,
    ]);
    expect(sampleAnimation(animation, 2.5).root?.position).toEqual([25, 0, 0]);
  });

  it.each(['linear', 'smooth'] as const)(
    'keeps the closing span of a %s loop, including negative time',
    (interpolation) => {
      const animation = { ...clip([1, 2, 3]), loop: true, interpolation };
      const wrapped = sampleAnimation(animation, 4.5);

      expect(sampleAnimation(animation, -0.5)).toEqual(wrapped);
      expect(sampleAnimation(animation, 9.5)).toEqual(wrapped);
      expect(wrapped.values.joint).toBeCloseTo(10);
      expect(wrapped.root?.position?.[0]).toBeCloseTo(10);
      expect(sampleAnimation(animation, 2).values.joint).toBe(10);
    },
  );

  it('keeps route velocity on the following span at an exact or repeated key', () => {
    const keys = [
      { t: 1, forward: 1, left: 2 },
      { t: 2, forward: 2, left: 3 },
      { t: 2, forward: 4, left: 5 },
      { t: 4, forward: 8, left: 9 },
    ];

    expect(routeAt([], 0)).toEqual({ at: { forward: 0, left: 0 }, velocity: { forward: 0, left: 0 } });
    expect(routeAt(keys, 0)).toEqual({ at: { forward: 1, left: 2 }, velocity: { forward: 0, left: 0 } });
    expect(routeAt(keys, 2)).toEqual({ at: { forward: 4, left: 5 }, velocity: { forward: 2, left: 2 } });
    expect(routeAt(keys, 3)).toEqual({ at: { forward: 6, left: 7 }, velocity: { forward: 2, left: 2 } });
    expect(routeAt(keys, 4)).toEqual({ at: { forward: 8, left: 9 }, velocity: { forward: 0, left: 0 } });
  });

  it('keeps exact tracked fixes, interpolated yaw and gaps without extending the trace', () => {
    const base = (x: number, yaw = 0) => ({ x, z: x * 2, yaw });
    const samples = [
      { t: 0.03125, base: base(1, Math.PI - 0.1) },
      { t: 0.03125, base: base(9) },
      { t: 0.09375, base: base(3, -Math.PI + 0.1) },
      { t: 0.125, base: null },
      { t: 0.25, base: base(5) },
    ];
    const frames = resampleBase({ samples, seconds: 0.28125 }, 0.03125);

    expect(frames[0]).toBeNull();
    expect(frames[1]).toEqual(samples[0].base);
    expect(frames[2]?.x).toBeCloseTo(6);
    expect(frames[3]?.x).toBeCloseTo(3);
    expect(frames.slice(4, 8)).toEqual([null, null, null, null]);
    expect(frames[8]).toEqual(base(5));
    expect(frames[9]).toBeNull();
    expect(resampleBase({ samples: [], seconds: 0.1 }, 0.1)).toEqual([null, null]);

    const turn = resampleBase({ samples: [samples[0], samples[2]], seconds: 0.0625 }, 0.0625)[1];

    expect(turn?.yaw).toBeCloseTo(Math.PI);
  });

  it('samples long animation and route clips without scanning their preceding keys', () => {
    let reads = 0;
    const keyframes = Array.from({ length: 65_536 }, (_, i) => ({
      get t() {
        reads++;

        return i;
      },
      values: { joint: i },
      forward: i,
      left: i * 2,
    }));

    expect(sampleAnimation({ ...clip([]), duration: 65_536, keyframes }, 65_534.5).values.joint).toBe(65_534.5);
    expect(reads).toBeLessThanOrEqual(25);

    reads = 0;

    expect(routeAt(keyframes, 65_534.5)).toEqual({
      at: { forward: 65_534.5, left: 131_069 },
      velocity: { forward: 1, left: 2 },
    });
    expect(reads).toBeLessThanOrEqual(20);
  });
});

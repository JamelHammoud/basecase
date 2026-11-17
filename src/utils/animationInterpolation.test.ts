import { describe, expect, it } from 'vitest';
import type { RobotAnimation } from '../types/robotics';
import { sampleAnimation } from './animation';

function animationOf(channels: number): RobotAnimation {
  return {
    id: 'interpolation',
    name: 'Interpolation',
    duration: 3,
    loop: false,
    interpolation: 'linear',
    keyframes: Array.from({ length: 4 }, (_, k) => ({
      t: k,
      values: Object.fromEntries(Array.from({ length: channels }, (_, j) => [`joint${j}`, k * 10 + j])),
      root: { position: [k * 17, k * -31, k * 47] },
    })),
  };
}

describe('linear animation support', () => {
  it.each([32, 64])('reads only span endpoint channels for %i joints and root axes', (channels) => {
    const animation = animationOf(channels);
    const reads = [0, 0, 0, 0];

    animation.keyframes.forEach((keyframe, k) => {
      keyframe.values = new Proxy(keyframe.values, {
        get(target, key) {
          reads[k]++;

          return Reflect.get(target, key);
        },
      });

      keyframe.root!.position = new Proxy(keyframe.root!.position!, {
        get(target, key) {
          reads[k]++;

          return Reflect.get(target, key);
        },
      });
    });

    const pose = sampleAnimation(animation, 1.25);

    expect(pose.values).toEqual(
      Object.fromEntries(Array.from({ length: channels }, (_, j) => [`joint${j}`, 12.5 + j])),
    );
    expect(pose.root!.position).toEqual([21.25, -38.75, 58.75]);
    expect(reads).toEqual([0, channels + 3, channels + 3, 0]);
  });

  it('keeps a zero root when only an outer support frame has a root', () => {
    const animation = animationOf(2);

    delete animation.keyframes[1].root;
    delete animation.keyframes[2].root;

    const pose = sampleAnimation(animation, 1.25);

    expect(pose.root!.position).toEqual([0, 0, 0]);

    for (const angle of pose.root!.rotation!) expect(angle).toBeCloseTo(0);

    animation.keyframes[2].values.joint0 = -75;
    expect(sampleAnimation(animation, 1.25).values.joint0).toBe(-11.25);
  });
});

function previousSmooth(points: number[], u: number): number {
  const [p0, p1, p2, p3] = points;

  return (
    0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
  );
}

describe('smooth animation support', () => {
  it('shares time powers across nonlinear joint and root channels after edits', () => {
    const animation = animationOf(64);

    animation.interpolation = 'smooth';

    for (const [k, frame] of animation.keyframes.entries()) {
      for (const id of Object.keys(frame.values)) {
        const j = Number(id.slice(5));

        frame.values[id] = Math.sin(k * 7 + j) * (j + 1) * 100;
      }

      frame.root!.position = [Math.sin(k) * 300, k * k * -31, k ** 3 * 47];
    }

    for (const edited of [false, true]) {
      if (edited) animation.keyframes[2].values.joint0 = -1234;

      const before = structuredClone(animation);

      for (const time of [1, 1.001, 1.13, 1.25, 1.49, 1.75, 1.999]) {
        const pose = sampleAnimation(animation, time);
        const u = time - 1;

        for (const [id, value] of Object.entries(pose.values)) {
          expect(value).toBeCloseTo(
            previousSmooth(
              animation.keyframes.map((frame) => frame.values[id]),
              u,
            ),
            9,
          );
        }

        for (const [axis, value] of pose.root!.position!.entries()) {
          expect(value).toBeCloseTo(
            previousSmooth(
              animation.keyframes.map((frame) => frame.root!.position![axis]),
              u,
            ),
            9,
          );
        }
      }

      expect(animation).toEqual(before);
    }
  });
});

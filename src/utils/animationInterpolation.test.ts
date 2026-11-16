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

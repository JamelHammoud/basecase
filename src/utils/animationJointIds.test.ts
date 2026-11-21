import { describe, expect, it } from 'vitest';
import type { AnimationKeyframe, JointValues } from '../types/robotics';
import { animationJointIds } from './animation';

describe('animation joint identities', () => {
  it('matches the flattened union across sparse, repeated and reordered channels', () => {
    const keyframes: AnimationKeyframe[] = Array.from({ length: 600 }, (_, frame) => ({
      t: frame / 30,
      values: Object.fromEntries(Array.from({ length: 120 }, (_, joint) => [`joint_${(joint + frame) % 180}`, joint])),
    }));
    const before = structuredClone(keyframes);
    const expected = [...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe.values)))];

    expect([...animationJointIds(keyframes)]).toEqual(expected);
    expect(keyframes).toEqual(before);
    expect(animationJointIds([]).size).toBe(0);
  });

  it('keeps own enumerable names without reading channel values', () => {
    const values: JointValues = Object.create({ inherited: 1 });

    Object.defineProperty(values, 'hidden', { value: 2 });
    Object.defineProperty(values, 'channel', {
      enumerable: true,
      get: () => {
        throw new Error('Channel discovery only needs names');
      },
    });
    Object.defineProperty(values, '__proto__', { enumerable: true, value: 3 });

    expect([...animationJointIds([{ t: 0, values }])]).toEqual(['channel', '__proto__']);
  });

  it('rebuilds after edits and returns independent sets', () => {
    const keyframes = [{ t: 0, values: { shoulder: 0 } }];
    const first = animationJointIds(keyframes);

    keyframes.push({ t: 1, values: { shoulder: 10 } });
    first.add('removed');

    expect([...animationJointIds(keyframes)]).toEqual(['shoulder']);
    expect([
      ...animationJointIds([
        { t: 0, values: {} },
        { t: 1, values: { wrist: 0 } },
      ]),
    ]).toEqual(['wrist']);
  });
});

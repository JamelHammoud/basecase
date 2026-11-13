import { describe, expect, it } from 'vitest';
import { humanoid, walkBvh } from './mocap.fixtures';
import { parseBvh, retarget } from './mocap';

describe('retarget', () => {
  it('turns a BVH into the same keyframes on a G1-style humanoid', () => {
    const { rig, pointOf } = humanoid();
    const res = retarget(parseBvh(walkBvh(), 'Walk'), rig, pointOf);

    expect(JSON.stringify(res)).toMatchSnapshot();
  });

  it('keeps in-place and trimmed clips the same', () => {
    const { rig, pointOf } = humanoid();
    const res = retarget(parseBvh(walkBvh(), 'Walk'), rig, pointOf, { inPlace: true, start: 0.1, end: 0.4, fps: 20 });

    expect(JSON.stringify(res)).toMatchSnapshot();
  });
});

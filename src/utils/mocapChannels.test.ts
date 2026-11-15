import { describe, expect, it } from 'vitest';
import { parseBvh } from './mocap';
import { panTiltBvh, planarBvh } from './motionSkeleton.fixtures';

describe('BVH source frames', () => {
  it('retains rotation channel order and every final-frame value', () => {
    const motion = parseBvh(panTiltBvh());
    const rotations = motion.rotations!((motion.frames - 1) * motion.frameTime);

    expect(rotations.get('Head')).toEqual([
      { axis: 'Y', degrees: -60 },
      { axis: 'X', degrees: -30 },
    ]);
  });

  it('holds the last source frame and permits seeking back to the first frame', () => {
    const motion = parseBvh(planarBvh());
    const first = motion.sample(0).get('Tool')!.clone();
    const last = motion
      .sample((motion.frames - 1) * motion.frameTime)
      .get('Tool')!
      .clone();

    expect(first.toArray()).toEqual([240, 0, 0]);
    expect(last.distanceTo(first)).toBeGreaterThan(1);
    expect(
      motion
        .sample(motion.duration + 1)
        .get('Tool')!
        .distanceTo(last),
    ).toBe(0);
    expect(motion.sample(0).get('Tool')!.distanceTo(first)).toBe(0);
  });
});

import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseBvh } from './mocap';
import { motionSkeleton } from './motionSkeleton';
import { panTiltBvh, planarBvh, quadrupedBvh, waveBvh } from './motionSkeleton.fixtures';

describe('motion skeleton sampling', () => {
  it.each([
    { name: 'planar arm', text: planarBvh() },
    { name: 'pan and tilt with an End Site', text: panTiltBvh() },
    { name: 'four leg chains', text: quadrupedBvh() },
  ])('samples each frame once for $name', ({ text }) => {
    const motion = parseBvh(text);
    const positions = vi.spyOn(motion, 'sample');
    const rotations = vi.spyOn(motion, 'rotations');
    const ends = vi.spyOn(motion.endSites!, 'sample');
    const result = motionSkeleton({ motion, heightMm: 200, toleranceMm: 0.1 });
    const times = Array.from({ length: motion.frames }, (_, frame) => [frame * motion.frameTime]);

    expect(result).not.toHaveProperty('problem');
    expect(positions.mock.calls).toEqual(times);
    expect(rotations.mock.calls).toEqual(times);
    expect(ends.mock.calls).toEqual(motion.endSites!.rest.size ? times : []);
  });

  it.each(['position', 'rotation', 'length'])('stops sampling at the first bad %s frame', (fault) => {
    const motion = parseBvh(waveBvh());
    const sample = motion.sample;
    const channels = motion.rotations!;
    const at = 3 * motion.frameTime;
    const positions = vi.spyOn(motion, 'sample').mockImplementation((time) => {
      const points = sample(time);

      if (time === at && fault === 'position') points.get('RightHand')!.x = Number.NaN;

      if (time === at && fault === 'length') points.get('RightHand')!.multiplyScalar(3);

      return points;
    });
    const rotations = vi.spyOn(motion, 'rotations').mockImplementation((time) => {
      const frame = channels(time);

      if (time === at && fault === 'rotation') frame.get('RightArm')![0].degrees = Number.NaN;

      return frame;
    });
    const result = motionSkeleton({ motion, heightMm: 300, toleranceMm: 1 });

    expect(result).toMatchObject({
      problem: expect.any(String),
      limb: fault === 'rotation' ? 'RightArm' : 'RightHand',
    });
    expect(positions).toHaveBeenCalledTimes(4);
    expect(rotations).toHaveBeenCalledTimes(4);
  });

  it('keeps independent frames when the source reuses vectors and its root moves', () => {
    const text = planarBvh();
    const motion = parseBvh(text);
    const sample = motion.sample;
    const points = sample(0);
    const original = motionSkeleton({ motion: parseBvh(text), heightMm: 240, toleranceMm: 0.1 });

    motion.sample = (time) => {
      const frame = sample(time);
      const offset = new Vector3(400 + time * 100, 300 - time * 50, 200 + time * 25);

      for (const [name, point] of frame) points.get(name)!.copy(point).add(offset);

      return points;
    };

    const translated = motionSkeleton({ motion, heightMm: 240, toleranceMm: 0.1 });

    expect(translated).not.toHaveProperty('problem');

    if ('problem' in translated || 'problem' in original) throw new Error('Expected a fitted planar arm');

    expect(translated.skeleton).toEqual(original.skeleton);
    expect(translated.trajectory).toEqual(original.trajectory);
    expect(translated.dynamics).toEqual(original.dynamics);
    expect(translated.errors.Tool).toBeLessThanOrEqual(0.1);
  });
});

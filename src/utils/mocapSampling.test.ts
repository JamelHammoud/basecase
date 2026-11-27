import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBvh } from './mocap';
import { panTiltBvh } from './motionSkeleton.fixtures';

afterEach(() => vi.restoreAllMocks());

describe('BVH world position sampling', () => {
  it('updates each bone once for positions and end sites', () => {
    const motion = parseBvh(panTiltBvh());
    const update = vi.spyOn(THREE.Bone.prototype, 'updateMatrixWorld');

    motion.sample(0.4);
    expect(update).toHaveBeenCalledTimes(2);
    update.mockClear();
    motion.endSites!.sample(0.8);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('keeps rest and sampled vectors independent across interleaved times and readers', () => {
    const motion = parseBvh(panTiltBvh());
    const end = motion.endSites!;
    const rest = end.rest.get('Head_EndSite_0')!.clone();
    const first = end.sample(0).get('Head_EndSite_0')!;
    const halfway = end.sample(0.05).get('Head_EndSite_0')!;
    const expected = new THREE.Vector3(0, 0, 100).applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 12);

    expect(rest.toArray()).toEqual([0, 0, 100]);
    expect(halfway.distanceTo(expected)).toBeLessThan(0.00001);
    motion.rootQuaternion!(0.8);
    motion.sample(motion.duration);
    expect(end.sample(-1).get('Head_EndSite_0')!.toArray()).toEqual(rest.toArray());
    expect(end.sample(100).get('Head_EndSite_0')!.toArray()).toEqual(
      end.sample(motion.duration).get('Head_EndSite_0')!.toArray(),
    );
    expect(first.toArray()).toEqual(rest.toArray());
    expect(end.rest.get('Head_EndSite_0')!.toArray()).toEqual(rest.toArray());
    expect(halfway.distanceTo(expected)).toBeLessThan(0.00001);
    expect(motion.sample(0).get('Head')!.toArray()).toEqual([0, 0, 0]);
  });
});

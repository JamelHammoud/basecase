import { afterEach, describe, expect, it, vi } from 'vitest';
import * as catalog from '../utils/actuatorCatalog';
import type { MotionSkeletonFit } from '../utils/motionSkeleton';
import { motionServos } from './motionServos';

const motion: MotionSkeletonFit = {
  skeleton: {
    frame: 'z-up',
    pairs: [],
    joints: [
      { id: 'shoulder', origin: [0, 0, 0], axis: [0, 0, 1] },
      { id: 'elbow', parent: 'shoulder', origin: [200, 0, 0], axis: [0, 0, 1], tip: [210, 0, 0] },
    ],
  },
  trajectory: [],
  errors: {},
  dynamics: [
    { id: 'shoulder', peakSpeedDegS: 680, peakAccelerationDegS2: 500 },
    { id: 'elbow', peakSpeedDegS: 30, peakAccelerationDegS2: 0 },
  ],
};

describe('motion servo mass estimates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('finds lightweight servos without requiring an initial actuator choice', () => {
    const options = vi.spyOn(catalog, 'actuatorOptions');
    const seeded = motionServos({
      ...motion,
      skeleton: {
        ...motion.skeleton,
        joints: motion.skeleton.joints.map((joint) => ({ ...joint, actuator: 'component:dynamixel-xl330-m288' })),
      },
    });

    expect(options).toHaveBeenCalledTimes(1);

    const automatic = motionServos(motion);

    expect(seeded).not.toHaveProperty('problem');
    expect(automatic).not.toHaveProperty('problem');
    expect(options).toHaveBeenCalledTimes(2);
  });
});

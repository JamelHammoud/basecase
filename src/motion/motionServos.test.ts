import { describe, expect, it } from 'vitest';
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
  it('finds lightweight servos without requiring an initial actuator choice', () => {
    const seeded = motionServos({
      ...motion,
      skeleton: {
        ...motion.skeleton,
        joints: motion.skeleton.joints.map((joint) => ({ ...joint, actuator: 'component:dynamixel-xl330-m288' })),
      },
    });
    const automatic = motionServos(motion);

    expect(seeded).not.toHaveProperty('problem');
    expect(automatic).not.toHaveProperty('problem');
  });
});

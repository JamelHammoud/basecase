import { describe, expect, it } from 'vitest';
import type { RobotSkeleton } from '../types/skeleton';
import { skeletonSizing } from './skeletonSizing';

const arm = (tipX: number): RobotSkeleton => ({
  frame: 'z-up',
  massG: 1000,
  pairs: [],
  joints: [
    { id: 'shoulder', origin: [0, 0, 0], axis: [0, 0, 1], linkMassG: 100 },
    {
      id: 'elbow',
      parent: 'shoulder',
      origin: [100, 0, 0],
      axis: [0, 0, 1],
      tip: [tipX, 0, 0],
      linkMassG: 200,
      payloadG: 300,
      actuator: 'component:feetech-sts3215|c001',
    },
  ],
});

describe('skeleton inertia bounds', () => {
  it('keeps the full path-radius bound when a loaded arm is folded', () => {
    const folded = skeletonSizing(arm(0));
    const extended = skeletonSizing(arm(200));

    if (typeof folded === 'string' || typeof extended === 'string') throw new Error('Fixture cannot be sized');

    expect(folded.joints[0].inertiaKgM2).toBeCloseTo(
      0.1 * 0.1 ** 2 + 0.2 * 0.2 ** 2 + 0.3 * 0.2 ** 2 + 0.055 * 0.1 ** 2,
      8,
    );
    expect(folded.joints[0].inertiaKgM2).toBeCloseTo(extended.joints[0].inertiaKgM2!, 8);
    expect(folded.joints[1].inertiaKgM2).toBeCloseTo(0.2 * 0.1 ** 2 + 0.3 * 0.1 ** 2, 8);
    expect(folded.joints[0].riderRadiusMm?.elbow).toBe(100);
  });
});

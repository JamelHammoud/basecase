import { describe, expect, it, vi } from 'vitest';
import type { RobotSkeleton } from '../types/skeleton';
import { skeletonFromMotionRequest } from './agentMotionSkeleton';
import { designMotionInWorker } from '../motion/motionSkeletonClient';
import { waveBvh } from '../utils/motionSkeleton.fixtures';

const skeleton: RobotSkeleton = {
  frame: 'z-up',
  joints: [
    {
      id: 'shoulder',
      origin: [0, 0, 200],
      axis: [2, 0, 0],
      range: [-60, 60],
      actuator: 'component:feetech-sts3215|c018',
      tip: [0, 0, 100],
    },
  ],
  pairs: [],
};

const payload = { text: 'HIERARCHY', height_mm: 350, tolerance_mm: 8, limbs: ['leftArm'] };

describe('skeleton_from_motion request', () => {
  it('accepts a BVH clip through the shared fitting and sizing worker path', async () => {
    const place = vi.fn();
    const open = vi.fn();

    await skeletonFromMotionRequest(
      { text: waveBvh(), height_mm: 300, tolerance_mm: 2, limbs: ['rightArm'] },
      { solve: designMotionInWorker, place, open, parts: () => [], skeleton: () => undefined },
    );

    expect(place).toHaveBeenCalledTimes(1);
    expect(place.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(place.mock.calls[0][0]).toHaveLength(place.mock.calls[0][1].joints.length);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('forwards the motion and commits the normalized skeleton with servos once', async () => {
    const solve = vi.fn(async () => ({
      skeleton,
      trajectory: [],
      dynamics: [{ id: 'shoulder', peakSpeedDegS: 20, peakAccelerationDegS2: 30 }],
      errors: { leftArm: 4 },
      volts: 7.4,
    }));
    const place = vi.fn();
    const open = vi.fn();
    const reply = await skeletonFromMotionRequest(payload, {
      solve,
      place,
      open,
      parts: () => [],
      skeleton: () => undefined,
    });

    expect(solve).toHaveBeenCalledWith({ text: 'HIERARCHY', heightMm: 350, toleranceMm: 8, limbs: ['leftArm'] });
    expect(place).toHaveBeenCalledTimes(1);
    expect(place.mock.calls[0][1].joints[0].axis).toEqual([1, 0, 0]);
    expect(place.mock.calls[0][0]).toHaveLength(1);
    expect(place.mock.calls[0][0][0].frame).toBe('shoulder');
    expect(open).toHaveBeenCalledTimes(1);
    expect(reply.text).toContain('leftArm: 4 mm');
    expect(reply.text).toContain('Servo supply: 7.4 V');
    expect(reply.text).toContain('range −60° to 60°, peak speed 20°/s, peak acceleration 30°/s²');
  });

  it('names an unsuccessful limb without changing or opening the scene', async () => {
    const place = vi.fn();
    const open = vi.fn();
    const reply = await skeletonFromMotionRequest(payload, {
      solve: async () => ({ problem: 'Endpoint misses the tolerance.', limb: 'leftArm' }),
      place,
      open,
      parts: () => [],
      skeleton: () => undefined,
    });

    expect(reply.text).toContain('leftArm');
    expect(place).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it.each([{ text: '' }, { height_mm: 0 }, { tolerance_mm: Number.NaN }, { limbs: [] }])(
    'refuses malformed input before solving: %j',
    async (extra) => {
      const solve = vi.fn();

      await skeletonFromMotionRequest(
        { ...payload, ...extra },
        { solve, place: vi.fn(), open: vi.fn(), parts: () => [], skeleton: () => undefined },
      );
      expect(solve).not.toHaveBeenCalled();
    },
  );
});

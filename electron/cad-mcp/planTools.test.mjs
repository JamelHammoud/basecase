import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { skeletonFromMotion } from './planTools.mjs';

describe('skeleton_from_motion payload', () => {
  const schema = () => z.object(skeletonFromMotion.config.inputSchema);
  const dimensions = { height_mm: 350, tolerance_mm: 8 };

  it('accepts an attached BVH or URL with the requested size and limbs', () => {
    const attached = { file: 'wave.bvh', name: 'Wave', ...dimensions, limbs: ['leftArm', 'rightArm'] };
    const remote = { url: 'https://example.com/wave.bvh', ...dimensions };

    expect(schema().parse(attached)).toEqual(attached);
    expect(schema().parse(remote)).toEqual(remote);
  });

  it.each([{ height_mm: 0 }, { tolerance_mm: -1 }, { limbs: [] }, { limbs: [''] }, { url: 'file:///wave.bvh' }])(
    'refuses malformed choices: %j',
    (extra) => expect(schema().safeParse({ file: 'wave.bvh', ...dimensions, ...extra }).success).toBe(false),
  );
});

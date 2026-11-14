import { describe, expect, it } from 'vitest';
import type { LensShot } from './lensRender';
import { projectedKeypoints } from './labelPoints';

const shot: LensShot = {
  position: [0, 0, 0],
  target: [0, 0, -100],
  up: [0, 1, 0],
  lens: { model: 'pinhole', hfovDeg: 90 },
};

it('projects world points through the camera lens and marks occluded and out-of-frame points', () => {
  const points = projectedKeypoints({
    shot,
    width: 4,
    height: 4,
    depth: new Float32Array(16).fill(100),
    instances: [
      {
        id: 1,
        partId: 'arm',
        classId: 0,
        keypoints: { visible: [0, 0, -100], behind: [0, 0, -200], outside: [1000, 0, -100] },
      },
    ],
  });

  expect(points[1]).toEqual({
    visible: { x: 2, y: 2, visibility: 2 },
    behind: { x: 2, y: 2, visibility: 1 },
    outside: { x: 0, y: 0, visibility: 0 },
  });
});

it('keeps an in-frame point visible when no rendered surface occludes its pixel', () => {
  const result = projectedKeypoints({
    shot,
    width: 4,
    height: 4,
    depth: new Float32Array(16),
    instances: [{ id: 1, partId: 'cup', classId: 0, keypoints: { handle: [0, 0, -100] } }],
  });

  expect(result[1].handle).toEqual({ x: 2, y: 2, visibility: 2 });
});

describe.each([120, 180, 240])('fisheye %i degrees', (fovDeg) => {
  it('keeps points behind the optical plane when the lens sees them', () => {
    const result = projectedKeypoints({
      shot: { ...shot, lens: { model: 'fisheye', fovDeg } },
      width: 640,
      height: 480,
      depth: new Float32Array(640 * 480).fill(2000),
      instances: [{ id: 1, partId: 'cup', classId: 0, keypoints: { side: [100, 0, 10] } }],
    })[1].side;

    expect(result.visibility).toBe(fovDeg === 240 ? 2 : 0);
  });
});

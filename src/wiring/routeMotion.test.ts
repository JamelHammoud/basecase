import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { joint } from '../sim/fixtures/parts';
import { component, sceneOf } from './fixtures';
import { poseTransforms, routeMotion } from './routeMotion';
import { relativeMotionBound } from './routeBound';

it.each([
  { range: [-32, 29], half: 7.5 },
  { range: [2, 8], half: 3 },
  { range: [8, 2], half: 3 },
  { range: [-8, -2], half: 3 },
  { range: [7, 7], half: 0 },
  { range: [0, 0], half: 0 },
  { range: [-61440, 0], half: 7.5 },
  { range: [-61441, 0], half: 0 },
  { range: [NaN, 10], half: 0 },
  { range: [0, Infinity], half: 0 },
])('retains routing coverage for range $range', ({ range, half }) => {
  const parts = ['root', 'arm'].map((id) => component(id, 'dynamixel-xl330-m288'));
  const hinge = joint({
    id: 'hinge',
    link: ['root', 'arm'],
    origin: [0, 0, 0],
    axis: [0, 0, 1],
    effortNm: 1,
    range: [range[0], range[1]],
  });
  const scene = sceneOf(parts, [hinge]);
  const before = structuredClone(scene);
  const motion = routeMotion(scene);

  expect(motion.halves.get('hinge')).toBe(half);
  expect(scene).toEqual(before);

  hinge.range = [2, 4];

  expect(routeMotion(scene).halves.get('hinge')).toBe(1);
  expect(motion.halves.get('hinge')).toBe(half);
});

it.each(['revolute', 'prismatic'] as const)(
  'bounds relative motion between nested moving links and a separate %s obstacle',
  (type) => {
    const parts = ['root', 'arm', 'tip', 'obstacle'].map((id) => component(id, 'dynamixel-xl330-m288'));
    const shoulder = joint({
      id: 'shoulder',
      link: ['root', 'arm'],
      origin: [30, -10, 0],
      axis: [0, 0, 1],
      effortNm: 1,
      range: [-30, 30],
    });
    const wrist = {
      ...joint({
        id: 'wrist',
        link: ['arm', 'tip'],
        origin: [100, 0, 0],
        axis: [0, 1, 0],
        effortNm: 1,
        range: [-30, 30],
      }),
      parentJoint: 'shoulder',
    };
    const branch = {
      ...joint({
        id: 'branch',
        link: ['root', 'obstacle'],
        origin: [-40, 50, 0],
        axis: [1, 0, 0],
        effortNm: 1,
        range: [-30, 30],
      }),
      type,
    };
    const motion = routeMotion(sceneOf(parts, [shoulder, wrist, branch]));
    const point = { position: [120, 20, 15] as [number, number, number], obstacleId: 'tip' };
    const bounds = relativeMotionBound(motion);
    const bound = bounds(point, 'obstacle');
    const sample = { shoulder: 15, wrist: -15, branch: 15 };
    const relativePoint = (values: Record<string, number>) => {
      const transforms = poseTransforms(motion, values);

      return new Vector3(...point.position)
        .applyMatrix4(transforms.get('tip')!)
        .applyMatrix4(transforms.get('obstacle')!.clone().invert());
    };
    const center = relativePoint(sample);

    for (const shoulderDelta of [-7.5, -3, 0, 3, 7.5]) {
      for (const wristDelta of [-7.5, 0, 7.5]) {
        for (const branchDelta of [-7.5, 0, 7.5]) {
          const moved = relativePoint({
            shoulder: sample.shoulder + shoulderDelta,
            wrist: sample.wrist + wristDelta,
            branch: sample.branch + branchDelta,
          });

          expect(moved.distanceTo(center)).toBeLessThanOrEqual(bound + 1e-9);
        }
      }
    }

    expect(bounds(point, 'tip')).toBe(0);
  },
);

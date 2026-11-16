import { Vector3 } from 'three';
import { expect, it } from 'vitest';
import { parseBvh } from './mocap';
import { wrappedHingeBvh } from './motionSkeleton.fixtures';
import { motionScale } from './motionSkeletonSource';

const clip = parseBvh(wrappedHingeBvh());
const motionOf = (points: Vector3[]) => ({ ...clip, rest: new Map(points.map((point, i) => [`Bone${i}`, point])) });

function previousScale(points: Vector3[], heightMm: number): number {
  const spans = (['x', 'y', 'z'] as const).map((axis) => {
    const values = points.map((point) => point[axis]);

    return Math.max(...values) - Math.min(...values);
  });
  const height = spans[1] > 1e-9 ? spans[1] : Math.max(...spans);

  return heightMm / height;
}

it('preserves scale across vertical, horizontal, degenerate and nonfinite rest poses', () => {
  const fixtures = [
    [],
    [new Vector3(-0, 0, -0)],
    [new Vector3(1, 2, 3), new Vector3(101, 12, 203)],
    [new Vector3(1, 2, 3), new Vector3(101, 2, 203)],
    [new Vector3(), new Vector3(100, 1e-9, 200)],
    [new Vector3(), new Vector3(100, 1.001e-9, 200)],
    [new Vector3(Infinity, 1, 2), new Vector3(Infinity, 3, 4)],
    [new Vector3(1, Number.NaN, 2), new Vector3(3, 4, 5)],
    [new Vector3(Number.NaN, 1, 2), new Vector3(3, 4, 5)],
    ...Array.from({ length: 60 }, (_, seed) =>
      Array.from({ length: seed + 1 }, (_, i) => new Vector3(Math.sin(i + seed), Math.cos(i * seed), i - seed)),
    ),
  ];

  for (const points of fixtures) {
    const motion = motionOf(points);
    const before = points.map((point) => point.clone());

    for (const height of [0, -0, 300, 1000, Infinity, Number.NaN]) {
      expect(motionScale(motion, height)).toBe(previousScale(points, height));
    }

    expect([...motion.rest.values()]).toEqual(before);
  }
});

it('reads edited rest poses afresh', () => {
  const motion = motionOf([new Vector3(1, 2, 3), new Vector3(101, 12, 203)]);

  expect(motionScale(motion, 300)).toBe(30);
  motion.rest.get('Bone1')!.y = 32;
  expect(motionScale(motion, 300)).toBe(10);
  motion.rest = new Map([['Flat', new Vector3()]]);
  expect(motionScale(motion, 300)).toBe(Infinity);
});

it('scales rest poses beyond argument-spread limits', () => {
  const motion = motionOf(Array.from({ length: 160_000 }, (_, i) => new Vector3(i, i / 2, -i)));

  expect(motionScale(motion, 300)).toBeCloseTo(300 / 79_999.5, 15);
});

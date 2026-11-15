import type { Vec3 } from 'manifold-3d';
import { describe, expect, it, vi } from 'vitest';
import { smoothField } from './gridField';

const OFFSETS: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const CELLS: Vec3[] = [
  [1, 1, 1],
  [3, 2, 4],
  [4, 3, 2],
  [2, 4, 3],
];
const SIZE: Vec3 = [8, 9, 10];
const inner = (p: Vec3) => p.every((v, axis) => v > 0 && v < SIZE[axis] - 1);
const distance = (a: Vec3, b: Vec3) => a.reduce((sum, v, axis) => sum + Math.abs(v - b[axis]), 0);

function nodeValue(p: Vec3, cells: Vec3[]): number {
  if (!inner(p)) return -1;

  const filled = OFFSETS.filter((offset) => {
    const q = p.map((v, axis) => v + offset[axis]) as Vec3;

    return inner(q) && cells.some((cell) => distance(q, cell) <= 1);
  }).length;

  return Math.fround((2 * filled - 7) / 7);
}

function fixture(step: number, cells: Vec3[] = CELLS) {
  const min: Vec3 = [-2.7, 4.25, -6.1];
  const origin = min.map((v) => v - step * 1.37) as Vec3;
  const box = { min, max: origin.map((v, axis) => v + (SIZE[axis] - 3.5) * step) as Vec3 };
  const point = (p: Vec3) => p.map((v, axis) => origin[axis] + v * step) as Vec3;
  const test = (x: number, y: number, z: number) => {
    const at: Vec3 = [x, y, z];
    const cell = at.map((v, axis) => Math.round((v - origin[axis]) / step)) as Vec3;

    return cells.some((p) => distance(p, cell) === 0);
  };

  return { field: smoothField(test, box, step)!, box, point };
}

function weightedValue(p: Vec3, cells: Vec3[]): number {
  const base = p.map(Math.floor) as Vec3;
  let value = 0;

  for (let corner = 0; corner < 8; corner++) {
    const q = base.map((v, axis) => v + ((corner >> axis) & 1)) as Vec3;
    const weight = p.reduce((product, v, axis) => {
      const fraction = v - base[axis];

      return product * ((corner >> axis) & 1 ? fraction : 1 - fraction);
    }, 1);

    value += nodeValue(q, cells) * weight;
  }

  return value;
}

describe('smoothed shell carve fields', () => {
  it.each([0.2, 1.2, 3.1])('preserves dilation, blur and fractional samples at step %s', (step) => {
    const { field, point } = fixture(step);

    for (let k = 0; k < SIZE[2] - 1; k++) {
      for (let j = 0; j < SIZE[1] - 1; j++) {
        for (let i = 0; i < SIZE[0] - 1; i++) {
          const p: Vec3 = [i + 0.23, j + 0.57, k + 0.81];

          expect(field(point(p))).toBeCloseTo(weightedValue(p, CELLS), 13);
        }
      }
    }
  });

  it('keeps the exterior empty on each boundary and leaves query points unchanged', () => {
    const { field, point } = fixture(1.2);

    for (let axis = 0; axis < 3; axis++) {
      for (const boundary of [-1, 0, SIZE[axis] - 1, SIZE[axis]]) {
        const p: Vec3 = [3, 3, 3];

        p[axis] = boundary;

        const query = point(p);

        Object.freeze(query);
        expect(field(query)).toBeCloseTo(-1, 14);
      }
    }

    expect(field([Infinity, 0, 0])).toBe(-1);
    expect(field([-Infinity, 0, 0])).toBe(-1);

    const nonfinite = point([3, 3, 3]);

    nonfinite[0] = NaN;
    expect(field(nonfinite)).toBeNaN();
    expect(smoothField(() => false, { min: [0, 0, 0], max: [4, 5, 6] }, 1)).toBeNull();
  });

  it('owns its samples across source edits and independent rebuilds', () => {
    const cells = structuredClone(CELLS);
    const original = fixture(0.7, cells);
    const query = original.point([3.4, 2.2, 4.1]);
    const value = original.field(query);

    cells.length = 0;
    cells.push([5, 5, 5]);
    original.box.min.fill(-100);
    original.box.max.fill(100);

    const changed = fixture(0.7, cells);

    expect(original.field(query)).toBe(value);
    expect(changed.field(query)).toBeCloseTo(weightedValue([3.4, 2.2, 4.1], cells), 13);
    expect(changed.field(query)).not.toBe(value);
    expect(fixture(0.7).field(query)).toBe(value);
  });

  it.each([300, 600])('samples %i points without mapped arrays or resampling the predicate', (count) => {
    const predicate = vi.fn(() => true);
    const field = smoothField(predicate, { min: [0, 0, 0], max: [10, 12, 14] }, 1)!;
    const points = Array.from({ length: count }, (_, i): Vec3 => [i % 9, i % 11, i % 13]);
    const sampled = predicate.mock.calls.length;
    const maps = vi.spyOn(Array.prototype, 'map');
    let allocations: number;
    let total = 0;

    try {
      for (const p of points) total += field(p);

      allocations = maps.mock.calls.length;
    } finally {
      maps.mockRestore();
    }

    expect(allocations).toBe(0);
    expect(Number.isFinite(total)).toBe(true);
    expect(predicate).toHaveBeenCalledTimes(sampled);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Triangle, Vector3 } from 'three';
import { MeshIndex, type V3 } from './meshIndex';

const face = [0, 0, 0, 4, 0, 0, 0, 4, 0];
const regions: Array<{ name: string; point: V3; distance: number }> = [
  { name: 'vertex A', point: [-1, -1, 2], distance: Math.sqrt(6) },
  { name: 'vertex B', point: [5, -1, 2], distance: Math.sqrt(6) },
  { name: 'vertex C', point: [-1, 5, 2], distance: Math.sqrt(6) },
  { name: 'edge AB', point: [2, -1, 2], distance: Math.sqrt(5) },
  { name: 'edge AC', point: [-1, 2, 2], distance: Math.sqrt(5) },
  { name: 'edge BC', point: [3, 3, 2], distance: Math.sqrt(6) },
  { name: 'interior', point: [1, 1, 2], distance: 2 },
];

function competitor([x, y, z]: V3, distance: number) {
  return [x - 0.1, y - 0.1, z + distance, x + 0.1, y - 0.1, z + distance, x, y + 0.1, z + distance];
}

function transformed(values: number[], offset: V3) {
  return Float32Array.from(values, (v, i) => v + offset[i % 3]);
}

describe('nearest joint face', () => {
  it.each(regions)('compares the $name distance against another face', ({ point, distance }) => {
    for (const ratio of [0.99, 1.01]) {
      for (const offset of [
        [0, 0, 0],
        [13, -29, 47],
      ] as V3[]) {
        const soup = transformed([...face, ...competitor(point, distance * ratio)], offset);
        const query = point.map((v, i) => v + offset[i]) as V3;
        const index = new MeshIndex(soup);

        expect(index.nearestTriangle(query)).toBe(ratio < 1 ? 1 : 0);
      }
    }
  });

  it('keeps the first face on a tie, including reversed winding and on-surface picks', () => {
    const reverse = [...face.slice(6), ...face.slice(3, 6), ...face.slice(0, 3)];
    const index = new MeshIndex(Float32Array.from([...face, ...reverse]));
    const parallel = new MeshIndex(Float32Array.from([...face, ...face.map((v, i) => v + (i % 3 === 2 ? 4 : 0))]));

    expect(index.nearestTriangle([1, 1, 0])).toBe(0);
    expect(index.nearestTriangle([1, 1, 2])).toBe(0);
    expect(parallel.nearestTriangle([1, 1, 2])).toBe(0);
  });

  it('skips degenerate, sub-threshold and incomplete faces', () => {
    const degenerate = [1, 1, 2, 1, 1, 2, 1, 1, 2];
    const tiny = [0, 0, 0, 0.00001, 0, 0, 0, 0.00001, 0];
    const index = new MeshIndex(Float32Array.from([...degenerate, ...tiny, ...face, 1, 1, 2]));

    expect(index.nearestTriangle([1, 1, 2])).toBe(2);
    expect(new MeshIndex(new Float32Array()).nearestTriangle([0, 0, 0])).toBe(-1);
    expect(new MeshIndex(Float32Array.from([...degenerate, ...tiny])).nearestTriangle([0, 0, 0])).toBe(-1);
  });

  it('measures welded coordinates and leaves the mesh and query unchanged across picks', () => {
    const moved = face.map((v, i) => v + (i % 3 === 2 ? 0.0004 : 0));
    const raised = face.map((v, i) => v + (i % 3 === 2 ? 10 : 0));
    const index = new MeshIndex(Float32Array.from([...face, ...moved, ...raised]));
    const before = structuredClone(index);
    const point: V3 = [0, 0, 0.0004];

    expect(index.nearestTriangle(point)).toBe(0);
    expect(index.nearestTriangle([1, 1, 10])).toBe(2);
    expect(index.nearestTriangle(point)).toBe(0);
    expect(point).toEqual([0, 0, 0.0004]);
    expect(index).toEqual(before);
  });

  it.each([300, 600])('reuses the query workspace across %i candidate faces', (count) => {
    const soup = Float32Array.from(Array.from({ length: count }, (_, t) => face.map((v) => v + t * 8)).flat());
    const index = new MeshIndex(soup);
    const triangles = new Set<Triangle>();
    const points = new Set<Vector3>();
    const targets = new Set<Vector3>();
    const original = Triangle.prototype.closestPointToPoint;
    const closest = vi.spyOn(Triangle.prototype, 'closestPointToPoint').mockImplementation(function (
      this: Triangle,
      point,
      target,
    ) {
      triangles.add(this);
      points.add(point);
      targets.add(target);

      return original.call(this, point, target);
    });

    try {
      expect(index.nearestTriangle([1, 1, 2])).toBe(0);
      expect(closest).toHaveBeenCalledTimes(count);
      expect([triangles.size, points.size, targets.size]).toEqual([1, 1, 1]);
    } finally {
      closest.mockRestore();
    }
  });
});

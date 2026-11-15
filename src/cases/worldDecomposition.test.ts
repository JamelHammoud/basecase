import { describe, expect, it } from 'vitest';
import { decomposeWorld, type WorldHull } from './worldDecomposition';

function boxes(specs: [number, number, number, number, number, number][]) {
  const positions: number[] = [];
  const indices: number[] = [];
  const faces = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ];

  for (const [x, y, z, w, h, d] of specs) {
    const offset = positions.length / 3;

    positions.push(x, y, z, x + w, y, z, x + w, y + h, z, x, y + h, z);
    positions.push(x, y, z + d, x + w, y, z + d, x + w, y + h, z + d, x, y + h, z + d);
    indices.push(...faces.map((index) => index + offset));
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function occupies(hull: WorldHull, point: number[]): boolean {
  return point.every((value, axis) => {
    const values = Array.from(hull.positions).filter((_, index) => index % 3 === axis);

    return value >= Math.min(...values) && value <= Math.max(...values);
  });
}

describe('world collision decomposition', () => {
  it('keeps free space under a table and through a doorway, in deterministic bounded pieces', async () => {
    const mesh = boxes([
      [-2000, -100, -2000, 4000, 100, 4000],
      [-800, 750, -500, 1600, 80, 1000],
      [-780, 0, -480, 80, 750, 80],
      [700, 0, -480, 80, 750, 80],
      [-2000, 0, 1800, 1500, 2000, 100],
      [500, 0, 1800, 1500, 2000, 100],
      [-500, 1900, 1800, 1000, 100, 100],
    ]);
    const hulls = await decomposeWorld(mesh);
    const repeated = await decomposeWorld(mesh);

    expect(repeated).toEqual(hulls);
    expect(hulls.length).toBeGreaterThan(1);
    expect(hulls.length).toBeLessThanOrEqual(64);
    expect(hulls.every((hull) => hull.positions.length / 3 <= 96)).toBe(true);
    expect(hulls.some((hull) => occupies(hull, [0, 400, 0]))).toBe(false);
    expect(hulls.some((hull) => occupies(hull, [0, 1000, 1850]))).toBe(false);
    expect(hulls.some((hull) => occupies(hull, [0, 790, 0]))).toBe(true);
  });

  it('gives a single open floor a collision thickness', async () => {
    const hulls = await decomposeWorld({
      positions: new Float32Array([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    });
    const heights = Array.from(hulls[0].positions).filter((_, index) => index % 3 === 1);

    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(0.99);
    expect(hulls[0].indices.length).toBeGreaterThanOrEqual(12);
  });

  it('refuses bad topology and refuses excess disconnected pieces without closing their gaps', async () => {
    await expect(
      decomposeWorld({ positions: new Float32Array([0, 0, NaN]), indices: new Uint32Array([0, 1, 2]) }),
    ).rejects.toThrow();
    await expect(
      decomposeWorld({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 9]) }),
    ).rejects.toThrow();
    await expect(decomposeWorld(boxes(Array.from({ length: 65 }, (_, i) => [i * 10, 0, 0, 1, 1, 1])))).rejects.toThrow(
      '64',
    );
  });
});

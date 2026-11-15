import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as math from './mapMath';
import { matchSweep, structureAt } from './mapMatch';
import { Voxels } from './voxels';

function corners(side: number, flat: boolean): Float32Array {
  const points: number[] = [];

  for (let i = 0; i < side; i++) {
    const a = i * 0.025;

    if (flat) {
      points.push(a, a * 0.6, 0.17, -a * 0.6, a, 0.17);

      continue;
    }

    for (let j = 0; j < side; j++) {
      const b = j * 0.025;

      points.push(a, b, 0, 0, a, b, b, 0, a);
    }
  }

  return Float32Array.from(points);
}

function filled(points: Float32Array): Voxels {
  const voxels = new Voxels(0.05, 10000);

  for (let i = 0; i < points.length; i += 3) voxels.add(points[i], points[i + 1], points[i + 2]);

  return voxels;
}

afterEach(() => vi.restoreAllMocks());

describe('scan matching workspaces', () => {
  it.each([true, false])('reuses its system across iterations with flat=%s', (flat) => {
    const points = corners(flat ? 120 : 21, flat);
    const voxels = filled(points);
    const before = voxels.points();
    const source = points.slice();
    const guess = new THREE.Matrix4().makeRotationZ(0.015).setPosition(0.02, -0.015, 0.025);
    const original = guess.clone();
    const solve6 = math.solve6;
    const solve = vi.spyOn(math, 'solve6');
    const systems: number[][] = [];

    solve.mockImplementation((h, g) => {
      systems.push(Array.from(h));

      return solve6(h, g);
    });

    const slices = vi.spyOn(Array.prototype, 'slice');
    const matched = matchSweep(voxels, points, guess);
    const copiedNormals = slices.mock.calls.filter(([start, end]) => end === start! + 3).length;

    slices.mockRestore();
    expect(copiedNormals).toBe(0);
    expect(solve.mock.calls.length).toBeGreaterThan(1);

    for (const h of systems) {
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < row; col++) expect(h[row * 6 + col]).toBe(h[col * 6 + row]);
      }
    }

    expect(new Set(solve.mock.calls.map(([h]) => h)).size).toBe(1);
    expect(math.poseGap(new THREE.Matrix4(), matched).metres).toBeLessThan(0.02);
    expect(math.poseGap(new THREE.Matrix4(), matched).radians).toBeLessThan(0.02);
    expect(guess.elements).toEqual(original.elements);
    expect(points).toEqual(source);
    expect(voxels.points()).toEqual(before);
    expect(matchSweep(voxels, points, guess).elements).toEqual(matched.elements);
    expect(solve.mock.calls.at(-1)![0]).not.toBe(solve.mock.calls[0][0]);
  });

  it('clears shared neighborhoods and keeps returned structures independent', () => {
    const points = corners(40, true);
    const voxels = filled(points);
    const cells = new Int32Array(27).fill(999);
    const line = Array.from({ length: voxels.count }, (_, v) => v).find(
      (v) => structureAt(voxels, v, true).normals.length === 6,
    )!;
    const first = structureAt(voxels, line, true, cells);
    const saved = structuredClone(first);

    expect(first.normals).toHaveLength(6);
    cells.fill(999);
    voxels.add(5, 5, 5);
    expect(structureAt(voxels, voxels.at(100, 100, 100), false, cells).normals).toEqual([]);
    expect(cells[0]).toBe(voxels.at(100, 100, 100));
    expect(first).toEqual(saved);
    expect(structureAt(voxels, line, true, cells)).toEqual(saved);
  });

  it.each([new Float32Array(), Float32Array.from([0, 0, 0]), Float32Array.from([20, 20, 20])])(
    'keeps an unconstrained guess without retaining data from another match',
    (points) => {
      const voxels = filled(corners(21, false));
      const guess = new THREE.Matrix4().setPosition(0.01, 0.02, 0.03);

      matchSweep(voxels, corners(21, false), guess);

      const matched = matchSweep(voxels, points, guess);

      expect(matched).not.toBe(guess);
      expect(matched.elements).toEqual(guess.elements);
    },
  );
});

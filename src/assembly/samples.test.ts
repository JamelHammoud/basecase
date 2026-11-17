import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import { gridSamples, worldPoints } from './samples';

type Point = [number, number, number];

function pointCloud(points: Point[]) {
  return solidFromPositions(new Float32Array(points.flatMap((p) => [...p, ...p, ...p])));
}

function cloud(count: number): Point[] {
  return Array.from({ length: count }, (_, i) => [((i * 37) % 101) - 50, ((i * 19) % 89) - 44, ((i * 43) % 79) - 39]);
}

function expectedCloud(points: Point[], cells: number): Float32Array {
  const box = new THREE.Box3().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const size = box.getSize(new THREE.Vector3());
  const groups = new Map<string, Array<{ point: Point; index: number; distance: number }>>();

  points.forEach((point, index) => {
    const cell = point.map((p, k) =>
      Math.min(cells - 1, Math.floor(((p - box.min.getComponent(k)) / Math.max(size.getComponent(k), 1e-6)) * cells)),
    );
    const centre = new THREE.Vector3(
      ...cell.map((c, k) => box.min.getComponent(k) + ((c + 0.5) / cells) * size.getComponent(k)),
    );
    const key = cell.join(',');
    const entries = groups.get(key) ?? [];

    entries.push({ point, index, distance: centre.distanceToSquared(new THREE.Vector3(...point)) });
    groups.set(key, entries);
  });

  const chosen = [...groups.values()].map((group) => group.sort((a, b) => a.distance - b.distance)[0]);

  return new Float32Array(chosen.sort((a, b) => a.index - b.index).flatMap((entry) => entry.point));
}

describe('assembly grid samples', () => {
  it('retains the nearest point per cell in source order, including equal distances and flat bounds', () => {
    const cases: Point[][] = [
      [
        [-1, 0, 0],
        [1, 0, 0],
        [0, 0, 0],
      ],
      [
        [-1, 0, 0],
        [1, 0, 0],
      ],
      [
        [4, 5, 6],
        [4, 5, 6],
      ],
      cloud(600),
      cloud(600).map(([x, y]) => [x, y, 7]),
    ];

    for (const points of cases) {
      for (const cells of [1, 2, 9, 14]) {
        const solid = pointCloud(points);
        const before = solid.positions.slice();

        expect(gridSamples(solid, cells)).toEqual(expectedCloud(points, cells));
        expect(solid.positions).toEqual(before);
      }
    }
  });

  it('samples triangle interiors and retains the first equally close interior point', () => {
    const solid = solidFromPositions(new Float32Array([0, 0, 0, 12, 0, 0, 0, 12, 0]));

    expect(gridSamples(solid, 1)).toEqual(new Float32Array([5, 6, 0]));
    expect(gridSamples(solidFromPositions(new Float32Array()), 9)).toEqual(new Float32Array());
  });

  it('caches each resolution on its solid and rebuilds replacement geometry independently', () => {
    const original = pointCloud(cloud(80));
    const samples = gridSamples(original, 9);
    const other = gridSamples(original, 14);
    const replacement = pointCloud(cloud(80).map(([x, y, z]) => [x + 20, y - 10, z + 5]));

    expect(gridSamples(original, 9)).toBe(samples);
    expect(gridSamples(original, 14)).toBe(other);
    expect(other).not.toBe(samples);
    expect(gridSamples(replacement, 9)).not.toEqual(samples);
    expect(gridSamples(original, 9)).toBe(samples);

    const matrix = new THREE.Matrix4().makeRotationY(0.7).setPosition(3, 4, 5);
    const before = samples.slice();
    const transformed = worldPoints(samples, matrix);

    expect(transformed).toEqual(
      Array.from({ length: samples.length / 3 }, (_, i) =>
        new THREE.Vector3().fromArray(samples, i * 3).applyMatrix4(matrix),
      ),
    );
    expect(samples).toEqual(before);
    expect(worldPoints(samples, matrix)[0]).not.toBe(transformed[0]);
  });

  it.each([300, 600])('selects representatives from %i triangles without per-point array callbacks', (count) => {
    const solid = pointCloud(cloud(count));
    const maps = vi.spyOn(Array.prototype, 'map');
    const reduces = vi.spyOn(Array.prototype, 'reduce');
    const components = vi.spyOn(THREE.Vector3.prototype, 'getComponent');
    const roots = vi.spyOn(Math, 'sqrt');
    let mapCalls: number;
    let reduceCalls: number;
    let componentCalls: number;
    let rootCalls: number;

    try {
      gridSamples(solid, 9);
      mapCalls = maps.mock.calls.length;
      reduceCalls = reduces.mock.calls.length;
      componentCalls = components.mock.calls.length;
      rootCalls = roots.mock.calls.length;
    } finally {
      maps.mockRestore();
      reduces.mockRestore();
      components.mockRestore();
      roots.mockRestore();
    }

    expect(mapCalls).toBe(0);
    expect(reduceCalls).toBe(0);
    expect(componentCalls).toBe(0);
    expect(rootCalls).toBe(count);
  });
});

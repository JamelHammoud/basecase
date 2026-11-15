import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShapeSolid } from './shapeSolid';

function solidOf(geometry: THREE.BufferGeometry): ShapeSolid {
  const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
  const solid = new ShapeSolid(new Float32Array(triangles.attributes.position.array));

  triangles.dispose();
  geometry.dispose();

  return solid;
}

describe('sampled surface area', () => {
  it('preserves the sum of rounded sample weights across subdivision, stride and discarded faces', () => {
    const solids = [
      solidOf(new THREE.BoxGeometry(20, 30, 40)),
      solidOf(new THREE.SphereGeometry(20, 48, 48)),
      solidOf(new THREE.BoxGeometry(0.1, 0.1, 0.1)),
      new ShapeSolid(new Float32Array()),
      new ShapeSolid(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
    ];

    for (const solid of solids) {
      const before = solid.positions.slice();
      const faces = solid.faces;
      const expected = Array.from(faces.areas).reduce((sum, area) => sum + area, 0);

      expect(solid.surfaceArea).toBe(expected);
      expect(solid.surfaceArea).toBe(expected);
      expect(solid.faces).toBe(faces);
      expect(solid.positions).toEqual(before);
      solid.dispose();
    }

    expect(solids[0].surfaceArea).toBeCloseTo(5200, 3);
    expect(solids[2].surfaceArea).toBe(0);
    expect(solids[3].surfaceArea).toBe(0);
    expect(solids[4].surfaceArea).toBe(0.5);
  });

  it.each([0, 300, 600])('sums %i sampled faces only once across repeated area queries', (count) => {
    const positions = new Float32Array(Array.from({ length: count }, () => [0, 0, 0, 1, 0, 0, 0, 1, 0]).flat());
    const solid = new ShapeSolid(positions);
    const sum = vi.spyOn(solid.faces.areas, 'reduce');

    for (let query = 0; query < Math.max(2, count); query++) expect(solid.surfaceArea).toBe(count / 2);

    expect(sum).toHaveBeenCalledTimes(1);
    sum.mockRestore();
    solid.dispose();
  });

  it('keeps totals separate for replacement geometry and a restored shape', () => {
    const original = solidOf(new THREE.BoxGeometry(20, 30, 40));
    const edited = solidOf(new THREE.BoxGeometry(40, 60, 80));
    const restored = new ShapeSolid(original.positions.slice());

    expect(original.surfaceArea).toBeCloseTo(5200, 3);
    expect(edited.surfaceArea).toBeCloseTo(20800, 2);
    expect(restored.surfaceArea).toBe(original.surfaceArea);
    expect(original.surfaceArea).toBeCloseTo(5200, 3);
    expect(edited.faces).not.toBe(original.faces);
    expect(restored.faces).not.toBe(original.faces);
    original.dispose();
    edited.dispose();
    restored.dispose();
  });
});

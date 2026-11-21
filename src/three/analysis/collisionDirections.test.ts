import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { collide, place, type Placed } from './collide';
import { ShapeSolid } from './shapeSolid';

const options = { toleranceMm: 0.1, maxSamples: 24, coplanar: false };

function pairwise(scene: Placed[]) {
  return scene
    .flatMap((a, i) => scene.slice(i + 1).flatMap((b) => collide([a, b], options).interferences))
    .sort((a, b) => b.depthMm - a.depthMm);
}

function fixture(count: number) {
  const geometry = new THREE.BoxGeometry(20, 20, 20).toNonIndexed();
  const solid = new ShapeSolid(new Float32Array(geometry.attributes.position.array));
  const scene = Array.from({ length: count }, (_, i) =>
    place(
      `part-${i}`,
      solid,
      new THREE.Matrix4().compose(
        new THREE.Vector3(i / 3, i / 5, i / 7),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(i / 11, i / 13, i / 17)),
        new THREE.Vector3(1, 1, 1),
      ),
    ),
  );

  geometry.dispose();

  return { scene, solid };
}

describe('collision containment directions', () => {
  it.each([4, 8])('shares directions across %i overlapping parts while retaining pairwise reports', (count) => {
    const { scene, solid } = fixture(count);
    const expected = pairwise(scene);
    const transform = vi.spyOn(THREE.Vector3.prototype, 'transformDirection');

    try {
      expect(collide(scene, options).interferences).toEqual(expected);

      const inverses = new Set(scene.map((part) => part.inverse));
      const directionTransforms = transform.mock.calls.filter(([matrix]) => inverses.has(matrix));

      expect(expected).toHaveLength((count * (count - 1)) / 2);
      expect(directionTransforms).toHaveLength(count * 3);
    } finally {
      transform.mockRestore();
      solid.dispose();
    }
  });

  it('reads changed inverse frames on every call and leaves isolated parts unprepared', () => {
    const { scene, solid } = fixture(3);
    const first = collide(scene, options);
    const rotated = place(scene[0].id, solid, new THREE.Matrix4().makeRotationY(Math.PI / 3));
    const moved = place(scene[1].id, solid, new THREE.Matrix4().makeTranslation(100, 0, 0));

    scene[0].matrix.copy(rotated.matrix);
    scene[0].inverse.copy(rotated.inverse);
    scene[0].box.copy(rotated.box);
    scene[1].matrix.copy(moved.matrix);
    scene[1].inverse.copy(moved.inverse);
    scene[1].box.copy(moved.box);

    const expected = pairwise(scene);
    const transform = vi.spyOn(THREE.Vector3.prototype, 'transformDirection');

    try {
      expect(collide(scene, options).interferences).toEqual(expected);
      expect(expected).toHaveLength(1);
      expect(first.interferences).toHaveLength(3);
      expect(transform.mock.calls.filter(([matrix]) => matrix === scene[1].inverse)).toHaveLength(0);
      expect(transform.mock.calls.filter(([matrix]) => matrix === scene[0].inverse)).toHaveLength(3);
    } finally {
      transform.mockRestore();
      solid.dispose();
    }
  });
});

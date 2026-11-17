import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { collide, place, type Placed } from './collide';
import { ShapeSolid } from './shapeSolid';

const OPTIONS = { toleranceMm: 10000, maxSamples: 1 };

function solid(geometry: THREE.BufferGeometry): ShapeSolid {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  const result = new ShapeSolid(new Float32Array(plain.attributes.position.array));

  plain.dispose();
  geometry.dispose();

  return result;
}

function legacyArea(a: Placed, b: Placed): number {
  const from = a.solid.surfaceArea <= b.solid.surfaceArea ? a : b;
  const onto = from === a ? b : a;
  const transform = onto.inverse.clone().multiply(from.matrix);
  const near = onto.solid.box.clone().expandByScalar(0.1);
  const { centers, normals, areas } = from.solid.faces;
  let area = 0;

  for (let i = 0; i < areas.length; i++) {
    const point = new THREE.Vector3().fromArray(centers, i * 3).applyMatrix4(transform);

    if (!near.containsPoint(point)) continue;

    const hit = onto.solid.bvh.closestPointToPoint(point, undefined, 0, 0.05);

    if (!hit) continue;

    const { index } = onto.solid.bvh.geometry;
    const corners = [0, 1, 2].map((k) => {
      const at = hit.faceIndex * 3 + k;

      return new THREE.Vector3().fromArray(onto.solid.positions, (index ? index.getX(at) : at) * 3);
    });
    const normal = new THREE.Triangle(corners[0], corners[1], corners[2]).getNormal(new THREE.Vector3());
    const direction = new THREE.Vector3().fromArray(normals, i * 3).transformDirection(transform);

    if (normal.dot(direction) > 0.95) area += areas[i];
  }

  return area;
}

function expectContact(a: Placed, b: Placed) {
  const area = legacyArea(a, b);
  const expected = area >= 4 ? [{ a: a.id, b: b.id, areaMm2: Math.round(area) }] : [];

  expect(collide([a, b], OPTIONS).coplanar).toEqual(expected);
}

describe('coplanar contact normals', () => {
  it('matches allocating normals across BVH indices, transforms, winding and changed placements', () => {
    const shapes = [
      solid(new THREE.BoxGeometry(20, 10, 20, 3, 2, 3)),
      solid(new THREE.BoxGeometry(60, 10, 60, 4, 2, 4)),
      solid(new THREE.SphereGeometry(15, 12, 8)),
      solid(new THREE.PlaneGeometry(20, 20, 3, 3)),
      solid(new THREE.PlaneGeometry(20, 20, 3, 3).rotateY(Math.PI)),
    ];
    const originals = shapes.map((shape) => shape.positions.slice());

    for (let i = 0; i < shapes.length; i++) {
      for (let j = 0; j < shapes.length; j++) {
        const frame = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.31, -0.57, 0.22));

        frame.setPosition(18, -37, 12);

        for (const offset of [0, 0.02, 0.06, 8]) {
          const moved = frame.clone().multiply(new THREE.Matrix4().makeTranslation(offset, 0, 0));
          const a = place('a', shapes[i], frame);
          const b = place('b', shapes[j], moved);

          expectContact(a, b);
          expectContact(place('a', shapes[j], moved), place('b', shapes[i], frame));
        }
      }
    }

    shapes.forEach((shape, i) => {
      expect(shape.positions).toEqual(originals[i]);
      shape.dispose();
    });
  });

  it.each([300, 600])('refreshes the retained normal only when %i nearby samples change target faces', (count) => {
    const source = solid(new THREE.PlaneGeometry(10, 10));
    const target = solid(new THREE.PlaneGeometry(50, 50));
    const centers = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const areas = new Float32Array(count).fill(1);

    for (let i = 0; i < count; i++) {
      normals[i * 3 + 2] = 1;
      centers[i * 3] = Math.floor((i * 3) / count) === 1 ? 10 : -10;
    }

    const originalCenters = centers.slice();

    const faces = vi.spyOn(source, 'faces', 'get').mockReturnValue({ centers, normals, areas });

    expect(source.bvh).toBeDefined();
    expect(target.bvh).toBeDefined();
    expect(target.faces.areas.length).toBeGreaterThan(0);

    const normal = vi.spyOn(THREE.Triangle.prototype, 'getNormal');
    const a = place('a', source, new THREE.Matrix4());
    const b = place('b', target, new THREE.Matrix4());

    expect(collide([a, b], OPTIONS).coplanar).toEqual([{ a: 'a', b: 'b', areaMm2: count }]);
    expect(normal).toHaveBeenCalledTimes(3);

    const triangles = new Set(normal.mock.contexts);
    const previous = normal.mock.contexts[0] as THREE.Triangle;

    expect(triangles.size).toBe(1);
    expect(new Set([previous.a, previous.b, previous.c]).size).toBe(3);
    normal.mockClear();
    normals.fill(0);
    expect(collide([a, b], OPTIONS).coplanar).toEqual([]);
    expect(normal).toHaveBeenCalledTimes(3);
    expect(normal.mock.contexts[0]).not.toBe(previous);
    expect(centers).toEqual(originalCenters);
    expect(areas).toEqual(new Float32Array(count).fill(1));
    normal.mockRestore();
    faces.mockRestore();
    source.dispose();
    target.dispose();
  });
});

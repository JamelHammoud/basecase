import { BufferAttribute, BufferGeometry, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WorldMesh } from '../worldImportTypes';
import { meshBounds, normalizeMesh, worldUnitScale } from './geometry';

type Point = [number, number, number];

type Triangle = [Point, Point, Point];

function meshOf(triangles: Triangle[]): WorldMesh {
  const positions = new Float32Array(triangles.flat(2));

  return {
    positions,
    indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i),
    normals: new Float32Array(),
    bounds: meshBounds(positions),
    groups: [],
    materials: [],
  };
}

function triangle(y = 0, slope = 0, width = 2): Triangle {
  return [
    [0, y, 0],
    [0, y, 1],
    [width, y + width * slope, 0],
  ];
}

function previousFloor(mesh: WorldMesh) {
  const planes = new Map<string, { normal: Vector3; point: Vector3; area: number }>();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();

  for (let i = 0; i < mesh.indices.length; i += 3) {
    a.fromArray(mesh.positions, mesh.indices[i] * 3);
    b.fromArray(mesh.positions, mesh.indices[i + 1] * 3);
    c.fromArray(mesh.positions, mesh.indices[i + 2] * 3);

    const normal = b.sub(a).cross(c.sub(a));
    const area = normal.length() / 2;

    if (!area || !Number.isFinite(area)) continue;

    normal.normalize();

    if (normal.y < Math.SQRT1_2) continue;

    const key = [...normal.toArray().map((v) => Math.round(v * 1000)), Math.round(normal.dot(a) * 1000)].join(',');
    const plane = planes.get(key);

    planes.set(key, { normal: normal.clone(), point: a.clone(), area: area + (plane?.area ?? 0) });
  }

  return [...planes.values()].sort((a, b) => b.area - a.area || a.point.y - b.point.y)[0];
}

function previousNormalize(mesh: WorldMesh, units: 'm' | 'mm' | 'auto') {
  const plane = previousFloor(mesh);
  const bounds = meshBounds(mesh.positions);
  const scale = worldUnitScale(Math.max(...bounds.max.map((v, i) => v - bounds.min[i])), units);
  const rotation = new Quaternion().setFromUnitVectors(plane.normal, new Vector3(0, 1, 0));
  const translation = [0, -plane.point.clone().applyQuaternion(rotation).y * scale, 0];
  const point = new Vector3();

  for (let i = 0; i < mesh.positions.length; i += 3) {
    point.fromArray(mesh.positions, i).applyQuaternion(rotation).multiplyScalar(scale);
    point.y += translation[1];
    mesh.positions.set(
      point.toArray().map((v) => (Math.abs(v) < 0.001 ? 0 : v)),
      i,
    );
  }

  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(mesh.positions, 3));

  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  mesh.normals = new Float32Array(geometry.getAttribute('normal').array);
  mesh.bounds = meshBounds(mesh.positions);
  geometry.dispose();

  return {
    scale,
    quaternion: rotation.toArray().map((v) => (v === 0 ? 0 : v)),
    translation: translation.map((v) => (v === 0 ? 0 : v)),
  };
}

function compareNormalization(source: WorldMesh, units: 'm' | 'mm' | 'auto' = 'mm') {
  const expected = structuredClone(source);
  const actual = structuredClone(source);
  const indices = actual.indices.slice();

  expect(normalizeMesh(actual, { units })).toEqual(previousNormalize(expected, units));
  expect(actual).toEqual(expected);
  expect(actual.indices).toEqual(indices);

  return actual;
}

describe('imported floor plane accumulation', () => {
  it('matches complete normalization across interleaved, tilted and translated plane groups', () => {
    for (let seed = 0; seed < 80; seed++) {
      const triangles = Array.from({ length: 36 }, (_, i) => {
        const group = (i * 7 + seed) % 5;
        const face = triangle(group * 3 + seed / 10, (group - 2) / 10, 1 + ((i + seed) % 4));
        const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), seed / 13);

        return face.map((p) =>
          new Vector3(...p)
            .applyQuaternion(rotation)
            .addScalar(seed / 100)
            .toArray(),
        ) as Triangle;
      });
      const source = meshOf(triangles);
      const untouched = structuredClone(source);

      compareNormalization(source, seed % 2 ? 'm' : 'auto');
      expect(source).toEqual(untouched);
    }
  });

  it('preserves lower-plane and insertion-order ties and the last representative in a rounded group', () => {
    const cases = [
      [triangle(3), triangle(1)],
      [triangle(1), triangle(3)],
      [triangle(0, 0.3), triangle(0, -0.3)],
      [triangle(0, -0.3), triangle(0, 0.3)],
      [triangle(), triangle(0.0002, 0.0001)],
      [triangle(0.0002, 0.0001), triangle()],
      [triangle(0.00049), triangle(0.00051), triangle(-0.00049), triangle(-0.00051)],
      [triangle(0, 0.00049), triangle(0, 0.00051), triangle(0, -0.00049), triangle(0, -0.00051)],
    ];

    for (const triangles of cases) compareNormalization(meshOf(triangles));

    const lower = meshOf(cases[0]);

    expect(normalizeMesh(lower, { units: 'mm' }).translation).toEqual([0, -1, 0]);
  });

  it('keeps winding, degenerate faces and the upward-normal cutoff', () => {
    const down = triangle(0, 0, 20).reverse() as Triangle;
    const collapsed: Triangle = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const triangles = [down, collapsed, triangle(0, 1.0001), triangle(0, 1), triangle(0, 0.9999)];

    compareNormalization(meshOf(triangles));
    expect(() => normalizeMesh(meshOf([down, collapsed, triangle(0, 1.0001)]), {})).toThrow(/upward-facing floor/);
  });

  it('reads later edits and keeps normalization results independent', () => {
    const source = meshOf([triangle(2), triangle(2, 0, 3), triangle(8)]);
    const first = compareNormalization(source);
    const saved = structuredClone(first);

    source.positions[1] += 0.1;
    source.positions[4] += 0.1;
    source.positions[7] += 0.1;
    compareNormalization(source);
    expect(first).toEqual(saved);
    first.positions.fill(0);
    compareNormalization(source);
  });

  it.each([
    [300, 1],
    [600, 1],
    [300, 5],
    [600, 5],
  ])('copies plane vectors once per group across %i triangles and %i planes', (count, groups) => {
    const source = meshOf(Array.from({ length: count }, (_, i) => triangle((i % groups) * 3)));
    const actual = structuredClone(source);
    const clone = vi.spyOn(Vector3.prototype, 'clone');
    const toArray = vi.spyOn(Vector3.prototype, 'toArray');

    try {
      previousNormalize(structuredClone(source), 'mm');
      expect(clone).toHaveBeenCalledTimes(count * 2 + 1);
      expect(toArray).toHaveBeenCalledTimes(count * 4);
      clone.mockClear();
      toArray.mockClear();
      normalizeMesh(actual, { units: 'mm' });
      expect(clone).toHaveBeenCalledTimes(groups * 2 + 1);
      expect(toArray).toHaveBeenCalledTimes(count * 3);
    } finally {
      clone.mockRestore();
      toArray.mockRestore();
    }

    compareNormalization(source);
  });
});

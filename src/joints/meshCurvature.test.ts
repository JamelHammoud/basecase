import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { MeshIndex } from './meshIndex';

function previousTopology(index: MeshIndex) {
  const edges = new Map<string, number[]>();
  const neighbours: number[][] = Array.from({ length: index.triangles }, () => []);
  let comparisons = 0;
  const cosine = (a: number, b: number) => {
    const n = index.normals;

    comparisons++;

    return n[a * 3] * n[b * 3] + n[a * 3 + 1] * n[b * 3 + 1] + n[a * 3 + 2] * n[b * 3 + 2];
  };

  for (let t = 0; t < index.triangles; t++) {
    if (index.areas[t] < 1e-9) continue;

    for (let k = 0; k < 3; k++) {
      const a = index.corners[t * 3 + k];
      const b = index.corners[t * 3 + ((k + 1) % 3)];
      const key = [a, b].sort((x, y) => x - y).join(',');
      const list = edges.get(key) ?? [];

      list.push(t);
      edges.set(key, list);
    }
  }

  for (const list of edges.values()) {
    for (const t of list) neighbours[t].push(...list.filter((u) => u !== t));
  }

  const curved = Uint8Array.from(neighbours, (list, t) =>
    list.some((u) => cosine(t, u) > Math.cos((65 * Math.PI) / 180) && cosine(t, u) < Math.cos((0.25 * Math.PI) / 180))
      ? 1
      : 0,
  );

  return { neighbours, curved, comparisons };
}

function soup(geometry: BufferGeometry, matrix = new Matrix4()) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  flat.applyMatrix4(matrix);

  const positions = Float32Array.from(flat.getAttribute('position').array);

  flat.dispose();
  geometry.dispose();

  return positions;
}

function pairedFaces(count: number, degrees = 30) {
  const radians = (degrees * Math.PI) / 180;

  return Float32Array.from(
    Array.from({ length: count / 2 }, (_, i) => {
      const x = i * 4;

      return [x, 0, 0, x + 1, 0, 0, x, 1, 0, x + 1, 0, 0, x, 0, 0, x, -Math.cos(radians), Math.sin(radians)];
    }).flat(),
  );
}

function expectTopology(positions: Float32Array) {
  const before = positions.slice();
  const index = new MeshIndex(positions);
  const expected = previousTopology(index);

  expect(index.neighbours).toEqual(expected.neighbours);
  expect(index.curved).toEqual(expected.curved);
  expect(positions).toEqual(before);

  return index;
}

describe('shared-edge curvature classification', () => {
  it('preserves topology and curvature across transformed closed, open and curved meshes', () => {
    const random = seededRandom('123456789abcdef00123456789abcdef');

    for (let i = 0; i < 20; i++) {
      const matrix = new Matrix4().makeRotationFromEuler(new Euler(random() * 6, random() * 6, random() * 6));

      matrix.scale(new Vector3(i % 2 ? -1 : 1, 0.2 + random() * 3, 0.2 + random() * 3));
      matrix.setPosition(random() * 100, random() * 100, random() * 100);

      for (const geometry of [
        new BoxGeometry(10, 20, 30, 2, 3, 4),
        new CylinderGeometry(6, 6, 40, 24, 3, i % 2 === 0),
        new SphereGeometry(7, 16, 8),
        new TorusGeometry(8, 2, 8, 16),
      ])
        expectTopology(soup(geometry, matrix));
    }
  });

  it.each([0, 0.24999, 0.25001, 30, 64.99999, 65.00001, 90, 180])(
    'preserves strict thresholds at %f degrees',
    (angle) => {
      const index = expectTopology(pairedFaces(2, angle));

      expect(index.curved).toEqual(Uint8Array.from({ length: 2 }, () => Number(angle > 0.25 && angle < 65)));
    },
  );

  it.each([Math.cos((65 * Math.PI) / 180), Math.cos((0.25 * Math.PI) / 180), NaN, Infinity, -Infinity])(
    'excludes an exact threshold or nonfinite normal comparison of %f',
    (value) => {
      const cosine = vi.spyOn(MeshIndex.prototype, 'cosBetween').mockReturnValue(value);

      try {
        expect(new MeshIndex(pairedFaces(2)).curved).toEqual(new Uint8Array(2));
      } finally {
        cosine.mockRestore();
      }
    },
  );

  it('preserves nonmanifold neighbor order, repeated faces and welded edges', () => {
    const random = seededRandom('fedcba9876543210fedcba9876543210');

    for (let size = 3; size < 45; size++) {
      const faces = Array.from({ length: size }, (_, t) => {
        const angle = random() * Math.PI * 2;
        const nudge = t % 3 === 0 ? 0.0001 : 0;

        return [nudge, 0, 0, 1 + nudge, 0, 0, 0, Math.cos(angle), Math.sin(angle)];
      });

      expectTopology(Float32Array.from([...faces, faces[0], faces[1]].flat()));
    }
  });

  it('preserves neighbor order when several faces share weld-collapsed edges', () => {
    expectTopology(
      Float32Array.from([
        0, 0, 0, 0, 0.0001, 0, 1, 0, 0, 0, 0, 0, 0, 0.0001, 0.0001, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1,
      ]),
    );
  });

  it('preserves empty, degenerate, tiny, weld-collapsed, incomplete and nonfinite geometry', () => {
    const unusual = [
      [],
      [0, 0, 0, 1, 0, 0, 2, 0, 0],
      [0, 0, 0, 0.00001, 0, 0, 0, 0.00001, 0],
      [0, 0, 0, 0.0004, 0, 0, 0, 0.0004, 0],
      [NaN, 0, 0, 1, 0, 0, 0, 1, 0],
      [Infinity, 0, 0, 1, 0, 0, 0, 1, 0],
    ];

    for (const face of unusual) {
      expectTopology(Float32Array.from(face));
      expectTopology(Float32Array.from([...pairedFaces(2), ...face, 1, 2]));
    }
  });

  it('rebuilds classification after source edits and owns independent outputs', () => {
    const positions = pairedFaces(4);
    const first = expectTopology(positions);
    const saved = structuredClone({ neighbours: first.neighbours, curved: first.curved });

    positions.set(pairedFaces(2, 90));

    const second = expectTopology(positions);

    expect(first.neighbours).toEqual(saved.neighbours);
    expect(first.curved).toEqual(saved.curved);
    expect(second.curved).toEqual(new Uint8Array([0, 0, 1, 1]));
    second.neighbours[0].push(42);
    second.curved.fill(0);
    expect(first.neighbours).toEqual(saved.neighbours);
    expect(first.curved).toEqual(saved.curved);
  });

  it.each([300, 600])('classifies shared edges once for %i triangles', (count) => {
    const cosine = vi.spyOn(MeshIndex.prototype, 'cosBetween');

    try {
      const index = new MeshIndex(pairedFaces(count));
      const expected = previousTopology(index);

      expect(index.neighbours).toEqual(expected.neighbours);
      expect(index.curved).toEqual(new Uint8Array(count).fill(1));
      expect(cosine).toHaveBeenCalledTimes(count / 2);
      expect(expected.comparisons).toBe(count * 2);
    } finally {
      cosine.mockRestore();
    }
  });
});

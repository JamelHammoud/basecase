import { afterEach, describe, expect, it, vi } from 'vitest';
import { flatFaces } from './labels/labelFaces';
import { connectedGroups, isConnected, type Pair } from './merge/mergeJoins';
import type { MeshData } from './threeMf';
import { componentRoot } from './componentRoot';

function measured<T>(run: () => T) {
  const spy = vi.spyOn(Map.prototype, 'get');
  const result = run();
  const reads = spy.mock.calls.length;

  spy.mockRestore();

  return { result, reads };
}

function stripMesh(size: number): MeshData {
  const vertices = new Float32Array((size + 2) * 3);
  const indices = new Uint32Array(size * 3);

  for (let i = 0; i < size + 2; i++) {
    vertices[i * 3] = Math.floor(i / 2);
    vertices[i * 3 + 2] = i % 2;
  }

  for (let i = 0; i < size; i++) {
    const triangle = i % 2 ? [i + 2, i + 1, i] : [i + 2, i, i + 1];

    indices.set(triangle, (size - i - 1) * 3);
  }

  return { vertices, indices };
}

afterEach(() => vi.restoreAllMocks());

describe('connected component grouping', () => {
  it('keeps roots, discovers missing roots and compresses every traversed link', () => {
    const parents = new Map([
      ['a', 'b'],
      ['b', ''],
      ['separate', 'separate'],
    ]);

    expect(componentRoot(parents, 'a')).toBe('');
    expect([...parents]).toEqual([
      ['a', ''],
      ['b', ''],
      ['separate', 'separate'],
      ['', ''],
    ]);
    expect(componentRoot(parents, 'separate')).toBe('separate');
    expect(componentRoot(new Map([[1, 0]]), 1)).toBe(0);
  });

  it.each([300, 600])('groups %i print parts joined in descending order without recursive root walks', (size) => {
    const ids = Array.from({ length: size }, (_, i) => String(i).padStart(4, '0'));
    const pairs: Pair[] = ids.slice(1).map((id, i) => [id, ids[i]]);
    const { result: groups, reads } = measured(() => connectedGroups(ids, [...pairs].reverse()));

    expect(groups).toEqual([ids]);
    expect(reads).toBeLessThan(size * 12);
    expect(isConnected(ids, pairs)).toBe(true);
    expect(isConnected([...ids, 'isolated'], pairs)).toBe(false);
  });

  it('keeps print group order, isolated ids, cycles and repeated joins', () => {
    const ids = ['z', 'c', 'b', 'a', 'y', 'alone'];
    const pairs: Pair[] = [
      ['c', 'b'],
      ['z', 'y'],
      ['a', 'c'],
      ['b', 'a'],
      ['a', 'c'],
      ['z', 'z'],
    ];
    const before = structuredClone({ ids, pairs });

    expect(connectedGroups(ids, pairs)).toEqual([
      ['a', 'b', 'c'],
      ['y', 'z'],
    ]);
    expect(connectedGroups([], [])).toEqual([]);
    expect({ ids, pairs }).toEqual(before);
  });

  it.each([300, 600])('groups %i coplanar triangles in descending order without repeated root walks', (size) => {
    const mesh = stripMesh(size);
    const before = structuredClone(mesh);
    const { result: faces, reads } = measured(() => flatFaces(mesh, 0));

    expect(faces).toHaveLength(1);
    expect(faces[0].area).toBe(size / 2);
    expect(faces[0].tris).toHaveLength(size * 6);
    expect(faces[0].edges).toHaveLength((size + 2) * 4);
    expect(flatFaces(mesh, size)).toEqual([]);
    expect(mesh).toEqual(before);
    expect(reads).toBeLessThan(size * 20);
  });
});

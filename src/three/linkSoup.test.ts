import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { linkSoup, type SoupPiece } from './geometryOps';

function previousSoup(pieces: SoupPiece[]) {
  const soup = new Float32Array(pieces.reduce((sum, p) => sum + p.positions.length, 0));
  const matrix = new THREE.Matrix4();
  let offset = 0;

  for (const piece of pieces) {
    const part = new THREE.BufferAttribute(piece.positions.slice(), 3).applyMatrix4(matrix.fromArray(piece.matrix));

    soup.set(part.array, offset);
    offset += piece.positions.length;
  }

  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(soup, 3));

  return { soup, min: box.min.toArray(), max: box.max.toArray() };
}

function seededPieces(seed: number): SoupPiece[] {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };

  return Array.from({ length: seed % 7 }, (_, i) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(random() * 2000 - 1000, random() * 2000 - 1000, random() * 2000 - 1000),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)),
      new THREE.Vector3(random() * 4 - 2, random() * 4 - 2, random() * 4 - 2),
    );

    if (i % 2) matrix.elements[3] = random() * 0.001;

    return {
      positions: Float32Array.from({ length: (seed % 13) * 9 }, () => random() * 1000 - 500),
      matrix: matrix.toArray(),
    };
  });
}

afterEach(() => vi.restoreAllMocks());

describe('imported mesh soup assembly', () => {
  it('matches transformed float32 vertices and bounds across affine and projective pieces', () => {
    for (let seed = 1; seed <= 180; seed++) {
      const pieces = seededPieces(seed);
      const before = structuredClone(pieces);

      expect(linkSoup(pieces)).toEqual(previousSoup(pieces));
      expect(pieces).toEqual(before);
    }
  });

  it('bounds the stored float32 coordinates rather than unrounded transformed points', () => {
    const pieces = [
      { positions: new Float32Array([1, 2, 3]), matrix: new THREE.Matrix4().makeScale(1 / 3, 1 / 7, 1 / 9).toArray() },
    ];
    const result = linkSoup(pieces);

    expect(result.min).toEqual(Array.from(result.soup));
    expect(result.max).toEqual(result.min);
    expect(Math.abs(result.min[0] - 1 / 3)).toBeGreaterThan(1e-9);
    expect(result).toEqual(previousSoup(pieces));
  });

  it('keeps shared source buffers, typed-array views and later calls independent', () => {
    const storage = new Float32Array([99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 88]);
    const positions = storage.subarray(1, 10);
    const pieces = [
      { positions, matrix: new THREE.Matrix4().makeTranslation(12, -5, 8).toArray() },
      { positions, matrix: new THREE.Matrix4().makeScale(-2, 3, 0).toArray() },
    ];
    const before = storage.slice();
    const first = linkSoup(pieces);
    const saved = first.soup.slice();

    expect(first).toEqual(previousSoup(pieces));
    expect(storage).toEqual(before);
    positions[0] = -32;
    pieces[0].matrix[12] = 21;

    const second = linkSoup(pieces);

    expect(second).toEqual(previousSoup(pieces));
    expect(second.soup).not.toEqual(first.soup);
    second.soup.fill(0);
    expect(first.soup).toEqual(saved);
    expect(storage[0]).toBe(99);
    expect(storage[10]).toBe(88);
  });

  it('retains empty bounds, degenerate transforms and nonfinite coordinate behavior', () => {
    const matrices = [
      new THREE.Matrix4(),
      new THREE.Matrix4().makeScale(0, 0, 0),
      new THREE.Matrix4().makeScale(1e40, -1e40, 1),
      new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0),
    ];

    expect(linkSoup([])).toEqual({
      soup: new Float32Array(),
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    });

    for (const matrix of matrices) {
      for (const values of [[], [1, 2, -3], [NaN, Infinity, -Infinity], [-0, 0, -0]]) {
        const pieces = [{ positions: new Float32Array(values), matrix: matrix.toArray() }];

        expect(linkSoup(pieces)).toEqual(previousSoup(pieces));
      }
    }
  });

  it.each([300, 600])('removes intermediate vertex writes, copies and the bounds scan for %i triangles', (count) => {
    const pieces = [
      {
        positions: Float32Array.from({ length: count * 9 }, (_, i) => i / 7),
        matrix: new THREE.Matrix4().makeRotationX(-Math.PI / 2).toArray(),
      },
    ];
    const reads = vi.spyOn(THREE.BufferAttribute.prototype, 'getX');
    const writes = vi.spyOn(THREE.BufferAttribute.prototype, 'setXYZ');
    const copies = vi.spyOn(Float32Array.prototype, 'set');
    const expected = previousSoup(pieces);

    expect(reads).toHaveBeenCalledTimes(count * 6);
    expect(writes).toHaveBeenCalledTimes(count * 3);
    expect(copies).toHaveBeenCalledTimes(1);
    reads.mockClear();
    writes.mockClear();
    copies.mockClear();

    const actual = linkSoup(pieces);

    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(copies).not.toHaveBeenCalled();
    expect(actual).toEqual(expected);
  });
});

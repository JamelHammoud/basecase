import { describe, expect, it } from 'vitest';
import { conj, quatMul, rotate } from './quat';

function reference(q: ArrayLike<number>, v: ArrayLike<number>) {
  const r = quatMul(quatMul(q, [0, v[0], v[1], v[2]]), conj(q));

  return [r[1], r[2], r[3]];
}

describe('quaternion vector rotation', () => {
  it('preserves the two quaternion products exactly for finite and nonfinite inputs', () => {
    const special = [0, -0, 1, -1, Infinity, -Infinity, NaN, Number.MIN_VALUE, Number.MAX_VALUE];

    for (let seed = 0; seed < 300; seed++) {
      const q = Array.from({ length: 4 }, (_, i) => Math.sin(seed * 0.37 + i) * 2);
      const v = Array.from({ length: 3 }, (_, i) => Math.cos(seed * 0.19 + i) * 10);

      if (seed < special.length * 4) q[seed % 4] = special[Math.floor(seed / 4)];

      if (seed < special.length * 3) v[seed % 3] = special[Math.floor(seed / 3)];

      const before = structuredClone({ q, v });

      expect(rotate(q, v)).toEqual(reference(q, v));
      expect({ q, v }).toEqual(before);
    }
  });

  it('reads typed-array offsets into reusable storage and leaves default results independent', () => {
    const q = new Float64Array([99, 0.5, -0.5, 0.5, -0.5, 99]).subarray(1, 5);
    const vectors = new Float32Array([99, 1, 2, 3, -4, -5, -6, 99]).subarray(1, 7);
    const out = [0, 0, 0];
    const first = rotate(q, vectors);
    const saved = first.slice();

    expect(rotate(q, vectors, out)).toBe(out);
    expect(out).toEqual(reference(q, vectors));
    expect(rotate(q, vectors, out, 3)).toBe(out);
    expect(out).toEqual(reference(q, vectors.subarray(3)));
    expect(first).toEqual(saved);
    expect(rotate(q, vectors)).not.toBe(first);
    expect(vectors).toEqual(new Float32Array([1, 2, 3, -4, -5, -6]));
  });

  it('supports output storage that aliases either input', () => {
    const q = [0.5, -0.5, 0.5, -0.5];
    const v = [1, 2, 3];
    const expected = reference(q, v);
    const quaternionOutput = q.slice();

    expect(rotate(q, v, v)).toBe(v);
    expect(v).toEqual(expected);
    rotate(quaternionOutput, [1, 2, 3], quaternionOutput);
    expect(quaternionOutput.slice(0, 3)).toEqual(expected);
  });
});

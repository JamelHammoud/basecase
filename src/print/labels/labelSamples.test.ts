import { describe, expect, it } from 'vitest';
import { randomPoints } from './labelSamples';

function previousPoints(t: Float32Array): Array<[number, number]> {
  const areas: number[] = [];
  let sum = 0;
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;

    return seed / 4294967296;
  };

  for (let i = 0; i < t.length; i += 6) {
    sum += Math.abs((t[i + 2] - t[i]) * (t[i + 5] - t[i + 1]) - (t[i + 4] - t[i]) * (t[i + 3] - t[i + 1])) / 2;
    areas.push(sum);
  }

  return Array.from({ length: 40 }, () => {
    const target = random() * sum;
    const i =
      Math.max(
        0,
        areas.findIndex((a) => a >= target),
      ) * 6;
    let u = random();
    let v = random();

    if (u + v > 1) [u, v] = [1 - u, 1 - v];

    return [
      t[i] + (t[i + 2] - t[i]) * u + (t[i + 4] - t[i]) * v,
      t[i + 1] + (t[i + 3] - t[i + 1]) * u + (t[i + 5] - t[i + 1]) * v,
    ];
  });
}

describe('printed-label surface samples', () => {
  it('preserves every seeded coordinate across unequal, reversed and degenerate triangles', () => {
    let seed = 31;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return (seed % 2001) / 8 - 125;
    };

    for (let n = 0; n < 180; n++) {
      const tris = Float32Array.from({ length: (n + 1) * 6 }, next);
      const saved = tris.slice();

      expect(randomPoints(tris)).toEqual(previousPoints(tris));
      expect(randomPoints(tris.slice().reverse())).toEqual(previousPoints(tris.slice().reverse()));
      expect(tris).toEqual(saved);
    }
  });

  const degenerateFaces = [
    [],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 1, 8, 8, 8, 8, 8, 8],
    [8, 8, 8, 8, 8, 8, 0, 0, 1, 0, 0, 1],
    [0, 0, Infinity, 0, 0, 1],
    [0, 0, NaN, 0, 0, 1],
  ];

  it.each(degenerateFaces.map((values) => ({ values })))('keeps the previous fallback for $values', ({ values }) => {
    const tris = Float32Array.from(values);

    expect(randomPoints(tris)).toEqual(previousPoints(tris));
  });

  it('reads edited geometry and typed-array views afresh without changing previous results', () => {
    const storage = new Float32Array([99, 0, 0, 10, 0, 0, 10, 99]);
    const tris = storage.subarray(1, 7);
    const first = randomPoints(tris);
    const saved = structuredClone(first);

    tris[2] = 20;

    const edited = randomPoints(tris);

    expect(edited).toEqual(previousPoints(tris));
    expect(edited).not.toEqual(first);
    expect(first).toEqual(saved);
    expect(randomPoints(tris)).toEqual(edited);

    edited[0][0] = -999;

    expect(randomPoints(tris)).toEqual(previousPoints(tris));
    expect(storage[0]).toBe(99);
    expect(storage[7]).toBe(99);
  });
});

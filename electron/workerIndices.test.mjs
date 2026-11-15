import { describe, expect, it } from 'vitest';
import { workerIndices } from './workerIndices.mjs';

describe('worker batch indices', () => {
  it('keeps strided assignments and source order for uneven and empty batches', () => {
    expect(workerIndices(11, 4)).toEqual([
      [0, 4, 8],
      [1, 5, 9],
      [2, 6, 10],
      [3, 7],
    ]);
    expect(workerIndices(2, 4)).toEqual([[0], [1], [], []]);
    expect(workerIndices(0, 4)).toEqual([[], [], [], []]);
    expect(workerIndices(3, 1)).toEqual([[0, 1, 2]]);
    expect(workerIndices(3, 0)).toEqual([]);
  });

  it('assigns every job once and restores results including nulls in request order', () => {
    for (let workers = 1; workers <= 8; workers++) {
      for (let count = 0; count <= 129; count++) {
        const chunks = workerIndices(count, workers);
        const source = Array.from({ length: count }, (_, i) => (i % 3 === 0 ? null : { job: i }));
        const results = chunks.map((indices) => indices.map((i) => source[i]));
        const out = new Array(count);
        const assigned = chunks.flat();

        chunks.forEach((indices, w) => indices.forEach((i, k) => (out[i] = results[w][k])));
        expect(out).toEqual(source);
        expect(assigned).toHaveLength(count);
        expect(new Set(assigned).size).toBe(count);
        expect(chunks.every((indices, w) => indices.every((i) => i % workers === w))).toBe(true);
      }
    }
  });
});

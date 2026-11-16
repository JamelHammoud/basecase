import { describe, expect, it } from 'vitest';
import { prepareNormalStep } from './linkageFitNormal';
import { solveSquareInPlace, type Matrix } from './sketch/linalg';
import { prepareLeastNorm } from './sketch/leastNorm';

const DAMPING = [0, 1e-10, 1e-3, 1, 100, 1e-3];

function uncachedLeastNorm(j: Matrix, weights: number[], residuals: number[], damping: number) {
  const a = j.map((row, p) =>
    j.map((other, q) => {
      let sum = p === q ? damping : 0;

      for (let c = 0; c < weights.length; c++) sum += row[c] * weights[c] * other[c];

      return sum;
    }),
  );
  const y = solveSquareInPlace(a, residuals);

  if (!y) return null;

  return weights.map((weight, c) => {
    let sum = 0;

    for (let p = 0; p < j.length; p++) sum += j[p][c] * y[p];

    return -weight * sum;
  });
}

function counted<T extends number[] | Float64Array>(values: T) {
  let reads = 0;
  const array = new Proxy(values, {
    get(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, target);
    },
  });

  return { array, reads: () => reads };
}

it('keeps sketch trials independent after pivoting and partially singular elimination', () => {
  const j = [
    [1, 2],
    [2, 4],
  ];
  const weights = [1, 1];
  const residuals = [3, -1];
  const before = structuredClone({ j, weights, residuals });
  const step = prepareLeastNorm(j, weights, residuals);
  const other = prepareLeastNorm([[2, -1]], [1, 2], [4]);
  const independent = other(1)!;
  const retained = step(1)!;
  const saved = [...retained];

  for (const damping of [0, 1e-3, 10, 0, 1]) {
    expect(step(damping)).toEqual(uncachedLeastNorm(j, weights, residuals, damping));
    expect(other(1)).toEqual(independent);
    expect(retained).toEqual(saved);
  }

  expect(step(0)).toBeNull();
  expect({ j, weights, residuals }).toEqual(before);
});

describe('prepared damping steps', () => {
  it.each([1, 1e-12, 1e12])('preserves sketch arithmetic with a variable weight of %d', (weight) => {
    const j = [
      [1.2, -3.7, 0, 0.5],
      [0, 2.9, 4.1, -1],
      [2.2, 0.1, -2.7, 0.2],
    ];
    const weights = [weight, 1, 1, 1];
    const residuals = [0.3, -12, 2.7];
    const before = structuredClone({ j, weights, residuals });
    const step = prepareLeastNorm(j, weights, residuals);

    for (const damping of DAMPING) {
      expect(step(damping)).toEqual(uncachedLeastNorm(j, weights, residuals, damping));
    }

    expect({ j, weights, residuals }).toEqual(before);
  });

  it.each([20, 40])('reuses sketch products across six trials with %d residuals', (size) => {
    const columns = size + 5;
    const j = Array.from({ length: size }, (_, p) =>
      counted(Array.from({ length: columns }, (_, c) => Math.sin(p + c * 0.3) + Number(p === c))),
    );
    const reads = () => j.reduce((sum, row) => sum + row.reads(), 0);
    const step = prepareLeastNorm(
      j.map((row) => row.array),
      new Array<number>(columns).fill(1),
      new Array(size).fill(1),
    );
    const preparedReads = reads();

    for (const damping of DAMPING) expect(step(damping)).not.toBeNull();

    const cachedReads = reads();

    expect(cachedReads - preparedReads).toBe(size * columns * DAMPING.length);

    for (const damping of DAMPING) {
      expect(
        uncachedLeastNorm(
          j.map((row) => row.array),
          new Array<number>(columns).fill(1),
          new Array(size).fill(1),
          damping,
        ),
      ).not.toBeNull();
    }

    expect(cachedReads).toBeLessThan((reads() - cachedReads) / 5);
  });

  it('solves linkage normal equations without rereading columns for later damping trials', () => {
    const source = [
      [1, 2, -1, 0.5],
      [3, -1, 0, 2],
      [0, 1, 2, -3],
    ];
    const residuals = [2, -1, 4, 0.2];
    const columns = source.map((column) => counted(Float64Array.from(column)));
    const step = prepareNormalStep(
      columns.map((column) => column.array),
      residuals,
    );
    const preparedReads = columns.map((column) => column.reads());
    const retained: Array<{ result: Float64Array; saved: number[] }> = [];

    for (const damping of DAMPING) {
      const a = source.map((column, p) =>
        source.map((other, q) => {
          const dot = column.reduce((sum, v, i) => sum + v * other[i], 0);

          return p === q ? dot + damping * (dot + 1e-9) : dot;
        }),
      );
      const rhs = source.map((column) => -column.reduce((sum, v, i) => sum + v * residuals[i], 0));
      const expected = solveSquareInPlace(a, rhs)!;
      const actual = step(damping)!;

      expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 12));
      retained.push({ result: actual, saved: Array.from(actual) });
    }

    for (const { result, saved } of retained) expect(Array.from(result)).toEqual(saved);

    expect(columns.map((column) => column.reads())).toEqual(preparedReads);
    expect(columns.map(({ array }) => Array.from({ length: array.length }, (_, i) => array[i]))).toEqual(source);
    expect(residuals).toEqual([2, -1, 4, 0.2]);
  });

  it('keeps singular attempts from corrupting later regularized attempts', () => {
    const sketch = prepareLeastNorm([[0, 0]], [1, 1], [3]);
    const linkage = prepareNormalStep([new Float64Array(2)], [3, 4]);

    expect(sketch(0)).toBeNull();
    expect(linkage(0)).toBeNull();
    expect(sketch(1)).toEqual([-0, -0]);
    expect(Array.from(linkage(1)!)).toEqual([-0]);
    expect(sketch(0)).toBeNull();
    expect(linkage(0)).toBeNull();
  });

  it('resets partial elimination after a singular trial and isolates prepared systems', () => {
    const columns = [Float64Array.of(1, 2), Float64Array.of(2, 4)];
    const step = prepareNormalStep(columns, [3, -1]);
    const other = prepareNormalStep([Float64Array.of(2, -1)], [1, 4]);
    const original = other(1)!;
    const saved = Array.from(original);

    for (const damping of [1, 0, 10, 0, 1]) {
      const expected = solveSquareInPlace(
        [
          [5 + damping * (5 + 1e-9), 10],
          [10, 20 + damping * (20 + 1e-9)],
        ],
        [-1, -2],
      );
      const actual = step(damping);

      expect(actual === null).toBe(expected === null);
      expected?.forEach((value, i) => expect(actual![i]).toBeCloseTo(value, 12));
      expect(other(1)).toEqual(original);
      expect(Array.from(original)).toEqual(saved);
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { levenbergMarquardt, solveLinear } from './leastSquares';

describe('least squares', () => {
  it('pivots a dense system without copying tails or changing its inputs', () => {
    const n = 16;
    const solution = Array.from({ length: n }, (_, i) => i - 4);
    const matrix = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => (r === c ? n : ((r + c) % 5) - 2)),
    ).reverse();
    const rhs = matrix.map((row) => row.reduce((sum, v, c) => sum + v * solution[c], 0));

    matrix.forEach(Object.freeze);
    Object.freeze(matrix);
    Object.freeze(rhs);

    const slice = vi.spyOn(Array.prototype, 'slice');
    let result: number[] | null;
    let copies: number;

    try {
      result = solveLinear(matrix, rhs);
      copies = slice.mock.calls.length;
    } finally {
      slice.mockRestore();
    }

    expect(result).toEqual(solution.map((v) => expect.closeTo(v, 10)));
    expect(copies).toBe(0);
    expect(solveLinear([], [])).toEqual([]);
    expect(solveLinear([[1e-301]], [1])).toBeNull();
  });

  it('solves a small linear system and refuses a singular one', () => {
    expect(
      solveLinear(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ),
    ).toEqual([expect.closeTo(0.8, 9), expect.closeTo(1.4, 9)]);
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it('recovers the parameters of a decaying sine', () => {
    const t = Array.from({ length: 200 }, (_, i) => i * 0.02);
    const truth = [Math.log(1.7), Math.log(0.6)];
    const model = (x: number[]) => t.map((s) => Math.exp(x[0]) * Math.exp(-Math.exp(x[1]) * s) * Math.sin(3 * s));
    const measured = model(truth);
    const result = levenbergMarquardt({
      residual: (x) => Float64Array.from(model(x), (v, i) => v - measured[i]),
      x0: [0, 0],
      lower: [-2, -2],
      upper: [2, 2],
      maxIterations: 40,
    });

    expect(result.x[0]).toBeCloseTo(truth[0], 3);
    expect(result.x[1]).toBeCloseTo(truth[1], 3);
  });

  it('keeps the answer inside its bounds', () => {
    const result = levenbergMarquardt({
      residual: (x) => Float64Array.of(x[0] - 5),
      x0: [0],
      lower: [-1],
      upper: [1],
    });

    expect(result.x[0]).toBeLessThanOrEqual(1);
    expect(result.x[0]).toBeGreaterThan(0.9);
  });
});

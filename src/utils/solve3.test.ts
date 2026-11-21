import { describe, expect, it } from 'vitest';
import { fitCircle } from '../joints/cylinderFit';
import { determinant3, solve3 } from './solve3';

function copiedSolve(a: number[][], b: number[]) {
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  return [0, 1, 2].map((column) => det(a.map((row, r) => row.map((v, c) => (c === column ? b[r] : v)))) / det(a));
}

describe('three-dimensional direct determinants', () => {
  it('matches copied-column arithmetic exactly across dense and damped systems', () => {
    let seed = 391;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed / 2 ** 32 - 0.5;
    };

    for (let trial = 0; trial < 1000; trial++) {
      const dense = Array.from({ length: 3 }, () => Array.from({ length: 3 }, random));
      const damped = dense.map((row, r) =>
        dense.map((other, c) => row.reduce((sum, v, k) => sum + v * other[k], 0) + (r === c ? 1e-6 : 0)),
      );
      const b = Array.from({ length: 3 }, random);
      const before = structuredClone({ dense, damped, b });

      for (const a of [dense, damped]) {
        expect(solve3(a, b)).toEqual(copiedSolve(a, b));
        expect(solve3(a, b, determinant3(a))).toEqual(copiedSolve(a, b));
      }

      expect({ dense, damped, b }).toEqual(before);
    }
  });

  it.each([0, -0, 1e-14, 1e-12, Infinity, -Infinity, NaN])('preserves division behavior for %s', (value) => {
    const a = [
      [value, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    expect(solve3(a, [1, 0, -1])).toEqual(copiedSolve(a, [1, 0, -1]));
    expect(solve3(a, [0, -0, 0])).toEqual(copiedSolve(a, [0, -0, 0]));
  });

  it('retains circle fitting and its degenerate-point refusal', () => {
    const points: Array<[number, number]> = Array.from({ length: 48 }, (_, i) => [
      300 + 6 * Math.cos((i * Math.PI) / 24),
      -200 + 6 * Math.sin((i * Math.PI) / 24),
    ]);

    expect(fitCircle(points)).toEqual({ cx: 300, cy: -200, r: expect.closeTo(6, 10) });
    expect(
      fitCircle([
        [1, 1],
        [2, 2],
      ]),
    ).toBeNull();
    expect(
      fitCircle([
        [1, 1],
        [2, 2],
        [3, 3],
      ]),
    ).toBeNull();
    expect(
      fitCircle([
        [2, 3],
        [2, 3],
        [2, 3],
      ]),
    ).toBeNull();
  });
});

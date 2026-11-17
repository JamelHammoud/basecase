import { describe, expect, it, vi } from 'vitest';
import { decode, encode, levenbergMarquardt, residuals, type FitProblem } from './linkageFit';
import { fourBarPose } from './linkageKinematics';

function fixture(count: number, direction: 1 | -1) {
  const start = encode(
    {
      origin: [0, 0],
      angle: 0,
      ground: 40,
      crank: 20,
      coupler: 50,
      rocker: 50,
      point: [37, -12],
      thetas: Array.from({ length: count }, (_, i) => direction * i * 0.2),
    },
    direction,
  );
  const shape = decode(start, count, direction);
  const problem: FitProblem = {
    targets: shape.thetas.map((theta) => fourBarPose(shape, (theta * 180) / Math.PI)!.p),
    direction,
    bounds: { minLink: 10, maxLink: 300 },
  };

  return { start, problem };
}

describe('four-bar fit termination', () => {
  it.each([5, 12])('avoids derivative probes for an already fitted %s-point path', (count) => {
    for (const direction of [1, -1] as const) {
      const { start, problem } = fixture(count, direction);
      const saved = start.slice();
      const exp = vi.spyOn(Math, 'exp');

      try {
        const result = levenbergMarquardt(start, problem);

        expect(result.cost).toBeLessThan(1e-12);
        expect(result.x).toEqual(start);
        expect(result.x).not.toBe(start);
        expect(start).toEqual(saved);
        expect(exp).toHaveBeenCalledTimes(count + 3);
      } finally {
        exp.mockRestore();
      }
    }
  });

  it.each([5, 12])('stops probing after one accepted step fits a %s-point path', (count) => {
    const { start, problem } = fixture(count, 1);

    start[0] += 1e-5;

    const exp = vi.spyOn(Math, 'exp');

    try {
      const result = levenbergMarquardt(start, problem);

      expect(result.cost).toBeLessThan(1e-12);
      expect(result.x).not.toEqual(start);
      expect(exp).toHaveBeenCalledTimes((count + 11) * (count + 3));
    } finally {
      exp.mockRestore();
    }
  });

  it.each([5, 12])('checks the fit budget before probing a %s-point path', (count) => {
    const { start, problem } = fixture(count, 1);

    start[0] += 10;

    const expectedCost = residuals(start, problem).reduce((sum, value) => sum + value * value, 0);
    const exp = vi.spyOn(Math, 'exp');

    try {
      const result = levenbergMarquardt(start, problem, { checkAt: 0, worstCost: 1 });

      expect(result).toEqual({ x: start, cost: expectedCost });
      expect(exp).toHaveBeenCalledTimes(count + 3);
    } finally {
      exp.mockRestore();
    }
  });
});

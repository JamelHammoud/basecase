import { describe, expect, it } from 'vitest';
import { couplerCurve, couplerPoint, synthesizeFourBar, type PlacedFourBar, type Vec2 } from './linkage';

const LAMBDA: PlacedFourBar = {
  origin: [0, 0],
  angle: 0,
  ground: 40,
  crank: 20,
  coupler: 50,
  rocker: 50,
  point: [100, 0],
};
const LINE: Vec2[] = [0, 20, 40, 60, 80].map((x) => [x, 0]);

describe('synthesizeFourBar', () => {
  it('recovers a Chebyshev lambda linkage from its sampled coupler curve', () => {
    const path = Array.from({ length: 10 }, (_, i) => couplerPoint(LAMBDA, i * 36)!);
    const [best] = synthesizeFourBar(path);

    expect(best.maxErrorMm).toBeLessThan(1);
    expect(best.rmsErrorMm).toBeLessThanOrEqual(best.maxErrorMm);
    expect(best.grashof).toBe('crank-rocker');
    expect(best.minTransmissionDeg).toBeGreaterThan(15);
  });

  const line = synthesizeFourBar(LINE);

  it('traces a near-straight segment through five collinear points', () => {
    const [best] = line;
    const segment = couplerCurve(best.linkage, best.crank[0], best.crank[1], 200);

    expect(line).toHaveLength(3);
    expect(best.maxErrorMm).toBeLessThan(0.5);
    expect(Math.max(...segment.map(([, y]) => Math.abs(y)))).toBeLessThan(1.6);
  });

  it('gives the same linkages on every run', () => {
    expect(synthesizeFourBar(LINE)).toEqual(line);
  });

  it('returns nothing for points too far apart for any crank it can build', () => {
    expect(synthesizeFourBar([0, 750, 1500, 2250, 3000].map((x, i): Vec2 => [x, i % 2 ? 500 : 0]))).toEqual([]);
  });

  it('takes 5 to 12 points', () => {
    expect(synthesizeFourBar(LINE.slice(0, 4))).toEqual([]);
    expect(synthesizeFourBar(Array.from({ length: 13 }, (_, i): Vec2 => [i * 5, 0]))).toEqual([]);
  });
});

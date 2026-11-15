import { describe, expect, it, vi } from 'vitest';
import { decode, encode, residuals, type FitLinkage, type FitProblem } from './linkageFit';
import { closure, couplerOffset, type FourBar, type Links, type Vec2 } from './linkageKinematics';
import { seededRandom } from './seededRandom';

function previousClosure(l: Links, theta: number): { b: Vec2; c: Vec2 } | null {
  const b: Vec2 = [l.crank * Math.cos(theta), l.crank * Math.sin(theta)];
  const vx = l.ground - b[0];
  const vy = -b[1];
  const e = Math.hypot(vx, vy);

  if (e > l.coupler + l.rocker || e < Math.abs(l.coupler - l.rocker) || e === 0) return null;

  const phi = Math.atan2(vy, vx);
  const alpha = Math.acos(
    Math.min(1, Math.max(-1, (l.coupler * l.coupler + e * e - l.rocker * l.rocker) / (2 * l.coupler * e))),
  );

  return { b, c: [b[0] + l.coupler * Math.cos(phi + alpha), b[1] + l.coupler * Math.sin(phi + alpha)] };
}

function previousClamped(l: FourBar, theta: number): { p: Vec2; miss: number } {
  const exact = previousClosure(l, theta);

  if (exact) return { p: couplerOffset(exact.b, exact.c, l.point, l.coupler), miss: 0 };

  const b: Vec2 = [l.crank * Math.cos(theta), l.crank * Math.sin(theta)];
  const e = Math.hypot(l.ground - b[0], b[1]);
  const miss = Math.max(0, e - l.coupler - l.rocker) + Math.max(0, Math.abs(l.coupler - l.rocker) - e);
  const phi = Math.atan2(-b[1], l.ground - b[0]);
  const c: Vec2 = [b[0] + l.coupler * Math.cos(phi), b[1] + l.coupler * Math.sin(phi)];

  return { p: couplerOffset(b, c, l.point, l.coupler), miss };
}

function previousPathResiduals(x: Float64Array, problem: FitProblem): number[] {
  const l = decode(x, problem.targets.length, problem.direction);
  const cos = Math.cos(l.angle);
  const sin = Math.sin(l.angle);
  const out: number[] = [];
  let miss = 0;

  problem.targets.forEach((target, i) => {
    const sample = previousClamped(l, l.thetas[i]);

    out.push(
      l.origin[0] + sample.p[0] * cos - sample.p[1] * sin - target[0],
      l.origin[1] + sample.p[0] * sin + sample.p[1] * cos - target[1],
    );
    miss += sample.miss;
  });

  return [...out, 10 * miss];
}

const trial = (links: Links, count: number, direction: 1 | -1): FitLinkage => ({
  ...links,
  origin: [13, -7],
  angle: 0.73,
  point: [37, -12],
  thetas: Array.from({ length: count }, (_, i) => direction * i * 0.2),
});

const problemFor = (count: number, direction: 1 | -1): FitProblem => ({
  targets: Array.from({ length: count }, (_, i) => [i * 7, i % 2 ? 3 : -4]),
  direction,
  bounds: { minLink: 10, maxLink: 300 },
});

describe('four-bar fit closure', () => {
  it('preserves exact and clamped residuals across both sweep directions and edited trial vectors', () => {
    const random = seededRandom('52da7c0252da7c0252da7c0252da7c02');

    for (let i = 0; i < 200; i++) {
      const direction = i % 2 ? 1 : -1;
      const count = 5 + (i % 8);
      const links = {
        ground: random() * 300,
        crank: random() * 300,
        coupler: random() * 300,
        rocker: random() * 300,
      };
      const x = encode(trial(links, count, direction), direction);
      const problem = problemFor(count, direction);
      const saved = x.slice();

      expect(residuals(x, problem).slice(0, count * 2 + 1)).toEqual(previousPathResiduals(x, problem));
      expect(x).toEqual(saved);

      x[3 + (i % 4)] += 0.5;
      expect(residuals(x, problem).slice(0, count * 2 + 1)).toEqual(previousPathResiduals(x, problem));
    }
  });

  it.each([
    [40, 20, 10, 10],
    [40, 20, 50, 10],
    [20, 20, 50, 50],
    [40, 20, 0, 50],
    [40, 0, 50, 50],
    [Infinity, 20, 50, 50],
    [40, NaN, 50, 50],
  ])(
    'preserves tangencies, coincident pivots and nonfinite trials for %s, %s, %s, %s',
    (ground, crank, coupler, rocker) => {
      const links = { ground, crank, coupler, rocker };
      const l = trial(links, 12, 1);
      const x = encode(l, 1);
      const problem = problemFor(12, 1);

      for (const theta of [0, -0, Math.PI, -Math.PI, Infinity, NaN]) {
        expect(closure(l, theta)).toEqual(previousClosure(l, theta));
      }

      expect(residuals(x, problem).slice(0, 25)).toEqual(previousPathResiduals(x, problem));
    },
  );

  it.each([
    [40, 50, 50, 0],
    [100, 1, 1, 12],
    [80, 40, 40, 4],
  ])('uses each crank sine and cosine once with %s mm ground', (ground, coupler, rocker, failed) => {
    const x = encode(trial({ ground, crank: 20, coupler, rocker }, 12, 1), 1);
    const problem = problemFor(12, 1);
    const sin = vi.spyOn(Math, 'sin');
    const cos = vi.spyOn(Math, 'cos');

    try {
      const expected = previousPathResiduals(x, problem);

      expect(sin).toHaveBeenCalledTimes(25 + failed);
      expect(cos).toHaveBeenCalledTimes(25 + failed);
      sin.mockClear();
      cos.mockClear();

      const actual = residuals(x, problem);

      expect(sin).toHaveBeenCalledTimes(25);
      expect(cos).toHaveBeenCalledTimes(25);
      expect(actual.slice(0, 25)).toEqual(expected);
    } finally {
      sin.mockRestore();
      cos.mockRestore();
    }
  });
});

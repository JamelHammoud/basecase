import { describe, expect, it, vi } from 'vitest';
import { solveLinear } from '../../reality/leastSquares';
import { apply, fitHomography, invert, multiply, type PointPair, type Pt } from './homography';

const transform = [1.3, -0.2, 23, 0.4, 0.8, -41, 0.0002, -0.0003, 1];

function pairs(count: number, noise = 0): PointPair[] {
  return Array.from({ length: count }, (_, i) => {
    const from: Pt = [(i % 4) * 50 - 80, Math.floor(i / 4) * 40 - 60];
    const to = apply(transform, from);

    return { from, to: [to[0] + noise * Math.sin(i), to[1] + noise * Math.cos(i)] };
  });
}

describe('homography normal equations', () => {
  it.each([8, 16, 64])('recovers perspective and inverse projections from %i pairs', (count) => {
    const observations = pairs(count);
    const before = structuredClone(observations);
    const fitted = fitHomography(observations)!;
    const inverse = invert(fitted)!;

    for (const { from, to } of observations) {
      expect(apply(fitted, from)).toEqual(to.map((value) => expect.closeTo(value, 8)));
      expect(apply(inverse, to)).toEqual(from.map((value) => expect.closeTo(value, 8)));
    }

    expect(observations).toEqual(before);
    expect(fitHomography(observations)).toEqual(fitted);
  });

  it('fits noisy observations and reads edits without changing an earlier result', () => {
    const observations = pairs(64, 0.05);
    const fitted = fitHomography(observations)!;
    const before = [...fitted];

    for (const { from, to } of observations) {
      const projected = apply(fitted, from);

      expect(Math.hypot(projected[0] - to[0], projected[1] - to[1])).toBeLessThan(0.1);
      to[0] += 5;
    }

    const edited = fitHomography(observations)!;

    expect(edited).not.toEqual(fitted);
    expect(fitted).toEqual(before);
    expect(apply(edited, observations[0].from)[0] - apply(fitted, observations[0].from)[0]).toBeCloseTo(5, 8);
  });

  it('refuses too few pairs and singular point arrangements', () => {
    const line = pairs(4);

    expect(fitHomography(line.slice(0, 3))).toBeNull();
    expect(fitHomography(line)).toBeNull();
    expect(fitHomography(line.map(() => ({ from: [1, 1], to: [2, 2] })))).toBeNull();
  });
});

function previousNormalization(points: Pt[]) {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const spread = points.reduce((sum, p) => sum + Math.hypot(p[0] - cx, p[1] - cy), 0) / points.length;
  const scale = spread > 0 ? Math.SQRT2 / spread : 1;

  return { cx, cy, scale };
}

function previousEquations(observations: PointPair[]) {
  const ata = Array.from({ length: 8 }, () => new Array<number>(8).fill(0));
  const atb = new Array<number>(8).fill(0);
  const add = (row: number[], value: number) => {
    for (let r = 0; r < 8; r++) {
      atb[r] += row[r] * value;

      for (let c = r; c < 8; c++) ata[r][c] += row[r] * row[c];
    }
  };

  for (const { from, to } of observations) {
    const [x, y] = from;
    const [u, v] = to;

    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }

  for (let r = 0; r < 8; r++) for (let c = 0; c < r; c++) ata[r][c] = ata[c][r];

  return solveLinear(ata, atb);
}

function previousFit(observations: PointPair[]) {
  if (observations.length < 4) return null;

  const source = previousNormalization(observations.map((p) => p.from));
  const target = previousNormalization(observations.map((p) => p.to));
  const normalized = observations.map(({ from, to }): PointPair => ({
    from: [(from[0] - source.cx) * source.scale, (from[1] - source.cy) * source.scale],
    to: [(to[0] - target.cx) * target.scale, (to[1] - target.cy) * target.scale],
  }));
  const h = previousEquations(normalized);

  if (!h || h.some((v) => !Number.isFinite(v))) return null;

  const forward = [source.scale, 0, -source.cx * source.scale, 0, source.scale, -source.cy * source.scale, 0, 0, 1];
  const backward = [1 / target.scale, 0, target.cx, 0, 1 / target.scale, target.cy, 0, 0, 1];

  return multiply(backward, multiply([...h, 1], forward));
}

function generatedPairs(seed: number, count = 4 + (seed % 77)): PointPair[] {
  const scale = 10 ** ((seed % 9) - 4);
  const matrix = [1 + seed / 100, -0.2, seed * 17, 0.4, 0.8, -seed * 31, 0.0002, -0.0003, 1];

  return Array.from({ length: count }, (_, i) => {
    const from: Pt = [Math.sin(i * 17 + seed) * 200 * scale, Math.cos(i * 13 - seed) * 160 * scale];
    const to = apply(matrix, from);

    return { from, to: [to[0] + Math.sin(i + seed) * 0.01, to[1] + Math.cos(i - seed) * 0.01] };
  });
}

function mappedEntries(fit: typeof fitHomography, observations: PointPair[]) {
  const maps = vi.spyOn(Array.prototype, 'map');
  let entries: number;
  let result: number[] | null;

  try {
    result = fit(observations);
    entries = maps.mock.results.reduce((sum, call) => sum + (call.value as unknown[]).length, 0);
  } finally {
    maps.mockRestore();
  }

  return { result, entries };
}

describe('streamed homography normalization', () => {
  it('exactly matches allocated normalization across perspective, noise and coordinate scales', () => {
    for (let seed = 1; seed <= 160; seed++) {
      const observations = generatedPairs(seed);
      const before = structuredClone(observations);
      const expected = previousFit(observations);

      expect(expected).not.toBeNull();
      expect(fitHomography(observations)).toEqual(expected);
      expect(observations).toEqual(before);
      observations.reverse();
      observations[0].to[1] += 2;
      expect(fitHomography(observations)).toEqual(previousFit(observations));
    }
  });

  it('preserves refusals for short, singular, repeated and nonfinite observations', () => {
    const repeated: PointPair[] = Array.from({ length: 12 }, () => ({ from: [-0, 1], to: [2, -0] }));
    const cases = [[], pairs(3), pairs(4), repeated];

    for (const value of [NaN, Infinity, -Infinity]) {
      for (const side of ['from', 'to'] as const) {
        const observations = pairs(16);

        observations[7][side][1] = value;
        cases.push(observations);
      }
    }

    for (const observations of cases) {
      expect(previousFit(observations)).toBeNull();
      expect(fitHomography(observations)).toBeNull();
    }
  });

  it('fits frozen input and retains independent results after further fits and edits', () => {
    const observations = generatedPairs(5);

    for (const pair of observations) {
      Object.freeze(pair.from);
      Object.freeze(pair.to);
      Object.freeze(pair);
    }

    Object.freeze(observations);

    const fitted = fitHomography(observations)!;
    const retained = [...fitted];
    const second = fitHomography(generatedPairs(6))!;

    second[0] = 99;
    expect(fitted).toEqual(retained);
    expect(fitted).toEqual(previousFit(observations));
    expect(fitHomography(observations)).not.toBe(fitted);
  });

  it.each([300, 600])('removes mapped point storage for %i observations', (count) => {
    const observations = generatedPairs(4, count);
    const before = mappedEntries(previousFit, observations);
    const after = mappedEntries(fitHomography, observations);

    expect(after.result).toEqual(before.result);
    expect(after.result).not.toBeNull();
    expect(before.entries).toBe(3 * count + 8);
    expect(after.entries).toBe(8);
  });
});

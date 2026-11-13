import { describe, expect, it } from 'vitest';
import { BODY_ONE_EURO, createKeypointSmoother, createOneEuro } from './oneEuro';

const FPS = 30;
const at = (i: number) => i / FPS;

function noise(seed: number) {
  let s = seed;

  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;

    return (s / 2147483648) * 2 - 1;
  };
}

const variance = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;

  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
};

function lowPass(cutoff: number) {
  let last: number | null = null;

  return (x: number) => {
    const a = 1 / (1 + FPS / (2 * Math.PI * cutoff));

    last = last === null ? x : last + a * (x - last);

    return last;
  };
}

describe('createOneEuro', () => {
  it('passes the first sample through and holds on a repeated timestamp', () => {
    const filter = createOneEuro();

    expect(filter(0.42, 1)).toBeCloseTo(0.42, 12);
    expect(filter(0.9, 1)).toBeCloseTo(0.42, 12);
    expect(filter(0.9, 0.5)).toBeCloseTo(0.42, 12);
  });

  it('quiets a still, noisy landmark', () => {
    const filter = createOneEuro();
    const random = noise(7);
    const raw = Array.from({ length: 150 }, () => 0.3 + random() * 0.003);
    const out = raw.map((x, i) => filter(x, at(i)));

    expect(variance(out.slice(30))).toBeLessThan(variance(raw.slice(30)) * 0.2);
  });

  it('follows a step quickly, with less lag than a fixed low-pass at its minimum cutoff', () => {
    const filter = createOneEuro();
    const fixed = lowPass(BODY_ONE_EURO.minCutoff);
    const step = (i: number) => (i < 10 ? 0 : 0.3);
    const euro = Array.from({ length: 40 }, (_, i) => filter(step(i), at(i)));
    const plain = Array.from({ length: 40 }, (_, i) => fixed(step(i)));
    const after = 10 + Math.round(0.3 * FPS);

    expect(euro[after]).toBeGreaterThan(0.3 * 0.95);
    expect(plain[after]).toBeLessThan(0.3 * 0.9);

    for (let i = 11; i < 40; i++) expect(euro[i]).toBeGreaterThan(plain[i]);
  });
});

describe('createKeypointSmoother', () => {
  it('filters each coordinate per key and keeps a missing key for later', () => {
    const smoother = createKeypointSmoother();

    expect(smoother.filter({ hips: [0, 0, 0], head: [0, 0.7, 0] }, 0)).toEqual({ hips: [0, 0, 0], head: [0, 0.7, 0] });

    const moved = smoother.filter({ hips: [0.1, 0, 0] }, at(1));

    expect(Object.keys(moved)).toEqual(['hips']);
    expect(moved.hips[0]).toBeGreaterThan(0);
    expect(moved.hips[0]).toBeLessThan(0.1);

    const back = smoother.filter({ head: [0, 0.8, 0] }, at(2));

    expect(back.head[1]).toBeGreaterThan(0.7);
    expect(back.head[1]).toBeLessThan(0.8);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../utils/seededRandom';
import { optimalityUpdate } from './lightenFilter';

type Update = Parameters<typeof optimalityUpdate>[0];

function referenceUpdate({ density, gradient, frozen, budget }: Update): Float64Array {
  let low = 0;
  let high = Math.max(...Array.from(gradient, (value) => -value)) * 1e6;
  let result = density;

  for (let step = 0; step < 55; step++) {
    const lambda = (low + high) / 2;

    result = density.map((value, e) =>
      frozen[e]
        ? 1
        : Math.max(
            0.001,
            value - 0.15,
            Math.min(1, value + 0.15, value * Math.sqrt(Math.max(0, -gradient[e]) / lambda)),
          ),
    );

    if (result.reduce((sum, value) => sum + value, 0) > budget) low = lambda;
    else high = lambda;
  }

  return result;
}

function fixture(size: number, seed = size): Update {
  const random = seededRandom(seed.toString(16).padStart(8, '0').repeat(4));

  return {
    density: Float64Array.from({ length: size }, () => 0.001 + random() * 0.999),
    gradient: Float64Array.from({ length: size }, () => -(10 ** (random() * 12 - 6))),
    frozen: Uint8Array.from({ length: size }, () => (random() < 0.15 ? 1 : 0)),
    budget: size * (0.05 + random() * 0.9),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Lighten density updates', () => {
  it('preserves every density across generated gradients, budgets and mounting masks', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const input = fixture(seed % 37, seed);
      const before = structuredClone(input);
      const result = optimalityUpdate(input);

      expect(result).toEqual(referenceUpdate(input));
      expect(input).toEqual(before);
      expect(result).not.toBe(input.density);
    }
  });

  it.each([-1, 0, 0.001, 0.5, 1, 2])('keeps move limits, frozen cells and the result at budget share %s', (share) => {
    const input = fixture(60);

    input.budget = input.density.length * share;

    const result = optimalityUpdate(input);

    expect(result).toEqual(referenceUpdate(input));

    result.forEach((value, e) => {
      if (input.frozen[e]) {
        expect(value).toBe(1);

        return;
      }

      expect(value).toBeGreaterThanOrEqual(Math.max(0.001, input.density[e] - 0.15));
      expect(value).toBeLessThanOrEqual(Math.min(1, input.density[e] + 0.15));
    });
  });

  it.each([0, 1, -1, NaN, Infinity, -Infinity])('preserves the calculation for a gradient of %s', (value) => {
    const input = fixture(12);

    input.gradient.fill(value);

    expect(optimalityUpdate(input)).toEqual(referenceUpdate(input));
  });

  it('reads typed-array views afresh and keeps earlier results independent', () => {
    const input = fixture(30);

    input.density = input.density.subarray(5, 25);
    input.gradient = input.gradient.subarray(5, 25);
    input.frozen = input.frozen.subarray(5, 25);

    const first = optimalityUpdate(input);
    const saved = first.slice();

    input.density.fill(0.75);
    input.gradient.reverse();
    input.frozen.fill(0);
    input.budget = 10;

    const second = optimalityUpdate(input);

    expect(second).toEqual(referenceUpdate(input));
    expect(second).not.toEqual(first);
    expect(first).toEqual(saved);
    expect(second.buffer).not.toBe(first.buffer);
  });

  it.each([300, 600, 40000])('avoids temporary mapped buffers and volume scans for %s cells', (size) => {
    const input = fixture(size);
    const expected = referenceUpdate(input);
    const mapped = vi.spyOn(Float64Array.prototype, 'map');
    const reduced = vi.spyOn(Float64Array.prototype, 'reduce');
    const result = optimalityUpdate(input);

    expect(mapped).not.toHaveBeenCalled();
    expect(reduced).not.toHaveBeenCalled();
    expect(result).toEqual(expected);
  });
});

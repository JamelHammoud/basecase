import { describe, expect, it } from 'vitest';
import { timeIndex } from './timeIndex';

describe('ordered time lookup', () => {
  it.each(['at-or-after', 'after'] as const)('matches a linear lookup at the %s boundary', (edge) => {
    for (const times of [[], [2], [0, 1, 1, 1, 2, 4, 4], [3, 3, 3]]) {
      const samples = times.map((t) => ({ t }));

      for (const time of [-Infinity, -1, 0, 0.5, 1, 1.5, 2, 3, 4, 5, Infinity, NaN]) {
        const found = samples.findIndex((s) => s.t > time || (edge === 'at-or-after' && s.t === time));

        expect(timeIndex(samples, time, edge)).toBe(found < 0 ? samples.length : found);
      }
    }
  });

  it('bounds timestamp reads logarithmically without preparing or copying the input', () => {
    let reads = 0;
    const samples = Array.from({ length: 65_536 }, (_, i) => ({
      get t() {
        reads++;

        return i;
      },
    }));

    for (const time of [-1, 0, 32_768, 65_534.5, 65_535, 65_536]) {
      reads = 0;

      expect(timeIndex(samples, time)).toBe(Math.min(Math.max(Math.ceil(time), 0), samples.length));
      expect(reads).toBeLessThanOrEqual(17);
    }
  });
});

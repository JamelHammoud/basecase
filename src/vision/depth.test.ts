import { describe, expect, it } from 'vitest';
import { compactDepth } from './depth';

describe('depth worker payload', () => {
  it('keeps the full-resolution central distance while sending at most a 16 by 16 map', () => {
    const values = new Float32Array(32 * 32).fill(4);

    for (let y = 8; y < 24; y++) for (let x = 8; x < 12; x++) values[y * 32 + x] = 0.5;

    const output = compactDepth({ width: 32, height: 32, values, units: 'meters' });

    expect(output?.width).toBe(16);
    expect(output?.height).toBe(16);
    expect(output?.values.length).toBe(256);
    expect(output?.centerMeters).toBe(0.5);
    expect(output?.units).toBe('meters');
  });

  it('never converts relative or malformed depth into a metric distance', () => {
    expect(
      compactDepth({ width: 2, height: 2, values: new Float32Array(4).fill(0.2), units: 'relative' })?.centerMeters,
    ).toBeUndefined();
    expect(
      compactDepth({ width: 2, height: 2, values: new Float32Array([1, 2, NaN, 3]), units: 'meters' })?.centerMeters,
    ).toBeUndefined();
  });
});

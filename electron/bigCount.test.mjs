import { describe, expect, it } from 'vitest';
import { bigCount, bigFigures } from './bigCount.mjs';

describe('bigCount', () => {
  it('shows tenths under 10 without a trailing zero, then whole units', () => {
    expect([1500, 2000, 12_400, 450_000, 2_500_000, 25_000_000, 3_200_000_000].map(bigFigures)).toEqual([
      '1.5K',
      '2K',
      '12K',
      '450K',
      '2.5M',
      '25M',
      '3.2B',
    ]);
  });

  it('moves up a unit instead of reading 1000 of the one below', () => {
    expect(bigFigures(999_400)).toBe('999K');
    expect(bigFigures(999_600)).toBe('1M');
    expect(bigFigures(9_960)).toBe('10K');
  });

  it('shows whole numbers under a thousand, and never a stray decimal', () => {
    expect([0, 7, 999, 40.4].map(bigFigures)).toEqual(['0', '7', '999', '40']);
  });

  it('counts the noun', () => {
    expect(bigCount(1, 'step')).toBe('1 step');
    expect(bigCount(40_000, 'step')).toBe('40K steps');
    expect(bigCount(1_200_000, 'vertex', 'vertices')).toBe('1.2M vertices');
  });
});

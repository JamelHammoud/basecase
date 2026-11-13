import { describe, expect, it } from 'vitest';
import { clockTime, duration } from './duration';

describe('duration', () => {
  it('reads seconds to a tenth under a minute', () => {
    expect(duration(0.5)).toBe('0.5 s');
    expect(duration(45)).toBe('45 s');
  });

  it('carries into minutes, then hours, with the smaller unit padded', () => {
    expect(duration(59.97)).toBe('1 min');
    expect(duration(65)).toBe('1 min 05 s');
    expect(duration(3725)).toBe('1 h 02 min');
  });

  it('rounds estimates to the minute and never to zero', () => {
    expect(duration(0, 'min')).toBe('1 min');
    expect(duration(1800, 'min')).toBe('30 min');
    expect(duration(0.999 * 3600, 'min')).toBe('1 h 00 min');
    expect(duration(12.07 * 3600, 'min')).toBe('12 h 04 min');
  });
});

describe('clockTime', () => {
  it('keeps one decimal so a running clock holds its width', () => {
    expect(clockTime(2)).toBe('2.0 s');
    expect(clockTime(12.34)).toBe('12.3 s');
  });
});

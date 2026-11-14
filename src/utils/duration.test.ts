import { describe, expect, it } from 'vitest';
import { runClock, duration, speedLabel } from './duration';

describe('duration', () => {
  it('writes playback rates the way every speed control shows them', () => {
    expect([0.25, 0.5, 1, 2, 4].map(speedLabel)).toEqual(['¼×', '½×', '1×', '2×', '4×']);
  });

  it('reads seconds to a tenth under a minute', () => {
    expect(duration(0.5)).toBe('0.5 s');
    expect(duration(45)).toBe('45 s');
  });

  it('shows hundredths under a tenth, so a positive span never reads zero', () => {
    expect(duration(0)).toBe('0 s');
    expect(duration(0.025)).toBe('0.03 s');
    expect(duration(0.04)).toBe('0.04 s');
    expect(duration(0.001)).toBe('0.01 s');
    expect(duration(0.096)).toBe('0.1 s');
  });

  it('carries into minutes, then hours, with the smaller unit padded', () => {
    expect(duration(59.97)).toBe('1 min');
    expect(duration(65)).toBe('1 min 05 s');
    expect(duration(3725)).toBe('1 h 02 min');
    expect(duration(3659)).toBe('1 h 01 min');
  });

  it('rounds estimates to the minute and never to zero', () => {
    expect(duration(0, 'min')).toBe('1 min');
    expect(duration(1800, 'min')).toBe('30 min');
    expect(duration(0.999 * 3600, 'min')).toBe('1 h 00 min');
    expect(duration(12.07 * 3600, 'min')).toBe('12 h 04 min');
  });
});

describe('runClock', () => {
  it('keeps one decimal so a running clock holds its width', () => {
    expect(runClock(2)).toBe('2.0 s');
    expect(runClock(12.34)).toBe('12.3 s');
  });
});

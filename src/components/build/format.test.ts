import { describe, expect, it } from 'vitest';
import { hm } from './format';

describe('hm', () => {
  it('reads minutes under an hour and never zero', () => {
    expect(hm(0)).toBe('1 min');
    expect(hm(0.5)).toBe('30 min');
  });

  it('carries 60 minutes into the hour', () => {
    expect(hm(0.999)).toBe('1 h 00 min');
    expect(hm(1.999)).toBe('2 h 00 min');
  });

  it('pads minutes after hours', () => {
    expect(hm(12.07)).toBe('12 h 04 min');
  });
});

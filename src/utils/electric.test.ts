import { describe, expect, it } from 'vitest';
import { amps, volts } from './electric';

describe('volts and amps', () => {
  it('show tenths without a trailing zero', () => {
    expect(volts(7.4)).toBe('7.4 V');
    expect(volts(12)).toBe('12 V');
    expect(volts(11.099999)).toBe('11.1 V');
    expect(amps(2.04)).toBe('2 A');
    expect(amps(1.76)).toBe('1.8 A');
  });

  it('never show a positive value as zero', () => {
    expect(amps(0.04)).toBe('0.04 A');
    expect(amps(0.001)).toBe('0.01 A');
    expect(amps(0.05)).toBe('0.1 A');
    expect(amps(0)).toBe('0 A');
  });

  it('show whole units from 100', () => {
    expect(amps(99.94)).toBe('99.9 A');
    expect(amps(99.96)).toBe('100 A');
    expect(volts(240.4)).toBe('240 V');
  });
});

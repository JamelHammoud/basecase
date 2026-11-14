import { describe, expect, it } from 'vitest';
import { torque } from './torque';

describe('torque', () => {
  it('shows hundredths under 10 N·m, holding its width', () => {
    expect(torque(0)).toBe('0.00 N·m');
    expect(torque(0.42)).toBe('0.42 N·m');
    expect(torque(2.5)).toBe('2.50 N·m');
    expect(torque(9.99)).toBe('9.99 N·m');
  });

  it('never shows a positive torque as zero', () => {
    expect(torque(0.004)).toBe('0.004 N·m');
    expect(torque(0.0001)).toBe('0.001 N·m');
    expect(torque(0.006)).toBe('0.01 N·m');
  });

  it('shows three figures above 10 N·m', () => {
    expect(torque(9.996)).toBe('10.0 N·m');
    expect(torque(35.24)).toBe('35.2 N·m');
    expect(torque(99.96)).toBe('100 N·m');
    expect(torque(120.4)).toBe('120 N·m');
  });

  it('writes a negative torque with a minus sign, and a rounded zero without one', () => {
    expect(torque(-0.42)).toBe('−0.42 N·m');
    expect(torque(-0.0004)).toBe('−0.001 N·m');
    expect(torque(-0)).toBe('0.00 N·m');
  });
});

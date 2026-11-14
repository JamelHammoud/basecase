import { describe, expect, it } from 'vitest';
import { percent } from './percent.mjs';

describe('percent', () => {
  it('shows whole percents', () => {
    expect(percent(0)).toBe('0%');
    expect(percent(0.005)).toBe('1%');
    expect(percent(0.456)).toBe('46%');
    expect(percent(1)).toBe('100%');
    expect(percent(1.404)).toBe('140%');
  });

  it('never reads 0% for a share above none or 100% for one below all', () => {
    expect(percent(0.0004)).toBe('0.1%');
    expect(percent(0.0031)).toBe('0.3%');
    expect(percent(0.995)).toBe('99.5%');
    expect(percent(0.9999)).toBe('99.9%');
  });

  it('writes a fall with a minus sign', () => {
    expect(percent(-0.12)).toBe('−12%');
    expect(percent(-0)).toBe('0%');
  });

  it('rounds a lower bound down, without float error', () => {
    expect(percent(0.29, { down: true })).toBe('29%');
    expect(percent(0.957, { down: true })).toBe('95%');
    expect(percent(0.0004, { down: true })).toBe('0%');
  });
});

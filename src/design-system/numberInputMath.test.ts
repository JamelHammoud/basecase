import { describe, expect, it } from 'vitest';
import { clampNumber, evaluateMath, formatNumber, stepMultiplier } from './numberInputMath';

describe('evaluateMath', () => {
  it('does arithmetic with precedence, parentheses and units', () => {
    expect(evaluateMath('40/2')).toBe(20);
    expect(evaluateMath('2 + 3 * 4')).toBe(14);
    expect(evaluateMath('-(2+3)*4')).toBe(-20);
    expect(evaluateMath('12.5 mm')).toBe(12.5);
    expect(evaluateMath('90°')).toBe(90);
  });

  it('keeps the left side when dividing by zero', () => {
    expect(evaluateMath('8/0')).toBe(8);
  });

  it('rejects anything it cannot read', () => {
    for (const input of ['', 'abc', '(1+2', '1+', '2..3.4)', '1e3']) expect(evaluateMath(input), input).toBeNull();
  });
});

describe('number helpers', () => {
  it('clamps to the range and rounds to the precision', () => {
    expect(clampNumber(12.345, { precision: 1 })).toBeCloseTo(12.3, 10);
    expect(clampNumber(-5, { min: 0, precision: 1 })).toBe(0);
    expect(clampNumber(500, { max: 300, precision: 0 })).toBe(300);
  });

  it('formats finite numbers only', () => {
    expect(formatNumber(1.25, 1)).toBe('1.3');
    expect(formatNumber(Number.NaN, 1)).toBe('');
  });

  it('steps ×10 with Shift and ×0.1 with Option', () => {
    expect(stepMultiplier({ shiftKey: true, altKey: true })).toBe(10);
    expect(stepMultiplier({ shiftKey: false, altKey: true })).toBeCloseTo(0.1, 10);
    expect(stepMultiplier({ shiftKey: false, altKey: false })).toBe(1);
  });
});

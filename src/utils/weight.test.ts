import { describe, expect, it } from 'vitest';
import { weight } from './weight';

describe('weight', () => {
  it('shows tenths of a gram under 10 g, so a screw never reads 0 g', () => {
    expect(weight(0)).toBe('0 g');
    expect(weight(0.02)).toBe('0.02 g');
    expect(weight(0.4)).toBe('0.4 g');
    expect(weight(3.14)).toBe('3.1 g');
    expect(weight(9.94)).toBe('9.9 g');
  });

  it('shows whole grams up to a kilogram', () => {
    expect(weight(9.96)).toBe('10 g');
    expect(weight(85.4)).toBe('85 g');
    expect(weight(999.4)).toBe('999 g');
  });

  it('shows kilograms to three figures', () => {
    expect(weight(999.6)).toBe('1.00 kg');
    expect(weight(1250)).toBe('1.25 kg');
    expect(weight(9996)).toBe('10.0 kg');
    expect(weight(35_240)).toBe('35.2 kg');
    expect(weight(99_960)).toBe('100 kg');
    expect(weight(120_400)).toBe('120 kg');
  });

  it('never shows a negative weight', () => {
    expect(weight(-5)).toBe('0 g');
  });
});

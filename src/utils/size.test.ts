import { describe, expect, it } from 'vitest';
import { lengthFigure, lengthLabel, signedLengthLabel, sizeFigures, sizeLabel } from './size';

describe('size', () => {
  it('shows tenths of a millimeter under 100 mm, without a trailing zero', () => {
    expect(lengthFigure(3.46)).toBe('3.5');
    expect(lengthFigure(14.9)).toBe('14.9');
    expect(lengthFigure(48)).toBe('48');
    expect(lengthFigure(22.86)).toBe('22.9');
    expect(lengthFigure(99.94)).toBe('99.9');
  });

  it('shows whole millimeters from 100 mm', () => {
    expect(lengthFigure(99.96)).toBe('100');
    expect(lengthFigure(312.4)).toBe('312');
    expect(lengthFigure(1250.6)).toBe('1251');
  });

  it('never shows a positive length as 0, or a negative one', () => {
    expect(lengthFigure(0.02)).toBe('0.02');
    expect(lengthFigure(0.001)).toBe('0.01');
    expect(lengthFigure(0)).toBe('0');
    expect(lengthFigure(-4)).toBe('0');
  });

  it('joins a size with × and puts mm after the last figure', () => {
    expect(sizeFigures([48, 18, 14.9])).toBe('48 × 18 × 14.9');
    expect(sizeLabel([256, 256, 256])).toBe('256 × 256 × 256 mm');
  });

  it('shows a length in millimeters under a meter, then meters to three figures', () => {
    expect(lengthLabel(0.43)).toBe('0.4 mm');
    expect(lengthLabel(12.34)).toBe('12.3 mm');
    expect(lengthLabel(845.2)).toBe('845 mm');
    expect(lengthLabel(999.6)).toBe('1.00 m');
    expect(lengthLabel(1234)).toBe('1.23 m');
    expect(lengthLabel(12_345)).toBe('12.3 m');
    expect(lengthLabel(123_456)).toBe('123 m');
    expect(lengthLabel(-3)).toBe('0 mm');
  });

  it('keeps the sign of a signed length', () => {
    expect(signedLengthLabel(-12.34)).toBe('−12.3 mm');
    expect(signedLengthLabel(-1234)).toBe('−1.23 m');
    expect(signedLengthLabel(845.2)).toBe('845 mm');
    expect(signedLengthLabel(-0)).toBe('0 mm');
  });
});

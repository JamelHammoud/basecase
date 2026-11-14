import { describe, expect, it } from 'vitest';
import { angle, angleFromRadians, angleReading, readingFigure, signedAngleReading } from './angle';

describe('angle', () => {
  it('shows tenths under 10° and whole degrees from there', () => {
    expect(angle(4.56)).toBe('4.6°');
    expect(angle(4)).toBe('4°');
    expect(angle(9.96)).toBe('10°');
    expect(angle(12.5)).toBe('13°');
    expect(angle(180)).toBe('180°');
  });

  it('never reads 0° for an angle that isn’t zero', () => {
    expect(angle(0.02)).toBe('0.02°');
    expect(angle(0.001)).toBe('0.01°');
    expect(angle(0)).toBe('0°');
  });

  it('writes a negative angle with a minus sign, and never −0°', () => {
    expect(angle(-90)).toBe('−90°');
    expect(angle(-2.34)).toBe('−2.3°');
    expect(angle(-0)).toBe('0°');
  });

  it('reads radians', () => {
    expect(angleFromRadians(Math.PI / 2)).toBe('90°');
  });
});

describe('angleReading', () => {
  it('keeps one decimal so a live value holds its width', () => {
    expect(angleReading(45)).toBe('45.0°');
    expect(angleReading(-3.21)).toBe('−3.2°');
    expect(readingFigure(-0.01)).toBe('0.0');
  });

  it('signs an offset', () => {
    expect(signedAngleReading(2.34)).toBe('+2.3°');
    expect(signedAngleReading(-2.34)).toBe('−2.3°');
    expect(signedAngleReading(-0.01)).toBe('+0.0°');
  });
});

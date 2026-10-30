import { describe, expect, it } from 'vitest';
import { closestOnVertical, formatLength, fromFeetInches, heightsInFeet, snapPoint, toFeetInches } from './measureMath';

const square = [0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 10, 10, 0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 0];

describe('snapPoint', () => {
  it('snaps to a corner before an edge', () => {
    expect(snapPoint([9.2, 0, 0.4], square, 1)).toEqual({ point: [10, 0, 0], kind: 'vertex' });
  });

  it('snaps onto the nearest edge', () => {
    expect(snapPoint([5, 0, 0.6], square, 1)).toEqual({ point: [5, 0, 0], kind: 'edge' });
  });

  it('keeps the surface point away from edges', () => {
    expect(snapPoint([5, 0, 5], square, 1)).toEqual({ point: [5, 0, 5], kind: 'surface' });
  });
});

describe('closestOnVertical', () => {
  it('finds the height on the vertical line under the pointer ray', () => {
    const ray = [1 / Math.SQRT2, 1 / Math.SQRT2, 0] as [number, number, number];

    expect(closestOnVertical([10, 0, 0], [0, 0, 0], ray)[1]).toBeCloseTo(10);
  });

  it('keeps the start when looking straight down the line', () => {
    expect(closestOnVertical([5, 2, 5], [5, 100, 5], [0, -1, 0])).toEqual([5, 2, 5]);
  });
});

describe('measure labels', () => {
  const text = (mm: number, unit: 'metric' | 'imperial') =>
    formatLength(mm, unit)
      .map((p) => `${p.value} ${p.unit}`)
      .join(' ');

  it('reads metric in mm, then m past a metre', () => {
    expect(text(42.449, 'metric')).toBe('42.4 mm');
    expect(text(120.02, 'metric')).toBe('120 mm');
    expect(text(999.97, 'metric')).toBe('1 m');
    expect(text(1234.56, 'metric')).toBe('1.235 m');
  });

  it('reads imperial in feet and inches to the nearest sixteenth', () => {
    expect(text(50.8, 'imperial')).toBe('2 in');
    expect(text(92.075, 'imperial')).toBe('3 ⅝ in');
    expect(text(7.9375, 'imperial')).toBe('⁵⁄₁₆ in');
    expect(text(304.8, 'imperial')).toBe('1 ft');
    expect(text(1000, 'imperial')).toBe('3 ft 3 ⅜ in');
    expect(text(0.5, 'imperial')).toBe('0.02 in');
  });
});

describe('heights in feet and inches', () => {
  it('reads the average US man as 5 ft 9 in, never 12 inches', () => {
    expect(toFeetInches(1753)).toEqual({ feet: 5, inches: 9 });
    expect(toFeetInches(1828.5)).toEqual({ feet: 6, inches: 0 });
  });

  it('carries extra or negative inches into feet', () => {
    expect(toFeetInches(fromFeetInches({ feet: 5, inches: 14 }))).toEqual({ feet: 6, inches: 2 });
    expect(toFeetInches(fromFeetInches({ feet: 5, inches: -1 }))).toEqual({ feet: 4, inches: 11 });
  });

  it('uses feet where heights are said in feet, even with metric measurements', () => {
    expect(heightsInFeet('metric', 'en-US')).toBe(true);
    expect(heightsInFeet('metric', 'en-GB')).toBe(true);
    expect(heightsInFeet('metric', 'de-DE')).toBe(false);
    expect(heightsInFeet('metric', 'en')).toBe(true);
    expect(heightsInFeet('imperial', 'fr-FR')).toBe(true);
    expect(heightsInFeet('metric', 'not a locale')).toBe(false);
  });
});

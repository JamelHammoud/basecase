import { describe, expect, it } from 'vitest';
import { applySheet, sheetOf, snapThickness } from './materials';
import { sheetPart } from './sheet.fixtures';
import type { SheetProfile } from '../types/sheet';

const profile: SheetProfile = {
  thicknessMm: 3,
  normal: [0, 0, 1],
  outline: [
    [0, 0],
    [80, 0],
    [80, 60],
    [0, 60],
  ],
  holes: [],
};

describe('sheet materials', () => {
  it('snaps requests outside the stock range to its endpoints', () => {
    expect(snapThickness('aluminum-6061', 100)).toBeCloseTo(19.05);
    expect(snapThickness('aluminum-6061', Number.MAX_VALUE)).toBeCloseTo(19.05);
    expect(snapThickness('aluminum-6061', Number.MIN_VALUE)).toBeCloseTo(1.02);
  });

  it('snaps to nearest stock size and resizes thickness without changing the face', () => {
    const original = sheetPart();
    const changed = applySheet(original, { material: 'aluminum-6061', thicknessMm: 4.8 }, profile);

    expect(snapThickness('aluminum-6061', 4.8)).toBe(4.75);
    expect(changed.sheet).toEqual({ material: 'aluminum-6061', thicknessMm: 4.75 });
    expect(changed.dimensions).toEqual({ width: 80, height: 60, depth: 4.75 });
    expect(original.dimensions.depth).toBe(3);
  });

  it('accepts a thick stock rectangle without a measured box profile', () => {
    const original = sheetPart({ dimensions: { width: 10, height: 10, depth: 6.35 } });
    const changed = applySheet(original, { material: 'aluminum-6061', thicknessMm: 6.35 });

    expect(changed.sheet).toEqual({ material: 'aluminum-6061', thicknessMm: 6.35 });
    expect(changed.dimensions).toEqual(original.dimensions);
  });

  it.each([
    { kind: 'component' as const, componentId: 'raspberry-pi-5' },
    { kind: 'hardware' as const, hardware: { type: 'washer' as const, size: 'M3', length: 0 } },
    { supplyId: 'battery' },
    { role: 'cutout' as const },
  ])('keeps purchased parts and cutouts out of sheet manufacturing for %j', (fields) => {
    const part = sheetPart(fields);

    expect(() => applySheet(part, { material: 'aluminum-6061', thicknessMm: 3.18 }, profile)).toThrow(/sheet/);
    expect(part.sheet).toBeUndefined();
  });

  it('maps legacy tags while preserving measured thickness', () => {
    expect(sheetOf(sheetPart({ mechanicalTag: 'CNC Aluminum' }), profile)).toEqual({
      material: 'aluminum-6061',
      thicknessMm: 3,
    });
    expect(sheetOf(sheetPart({ mechanicalTag: 'Laser-Cut Acrylic/Carbon' }))).toEqual({
      material: 'carbon-fiber',
      thicknessMm: 3,
    });
    expect(sheetOf(sheetPart())).toBeUndefined();
  });
});

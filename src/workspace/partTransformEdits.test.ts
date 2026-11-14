import { Matrix4 } from 'three';
import { describe, expect, it } from 'vitest';
import { sheetPart } from '../sheet/sheet.fixtures';
import { isPrinted } from '../utils/bom';
import { withPartTransform } from './partTransformEdits';

describe('gizmo transforms of sheet parts', () => {
  const original = sheetPart({
    sheet: { material: 'aluminum-6061', thicknessMm: 3.18 },
    sheetTransform: new Matrix4().makeScale(1, 1, 1.06).toArray(),
  });

  it('keeps the sheet setting for translation and rotation with equivalent dimensions', () => {
    const moved = withPartTransform(original, {
      position: [20, 30, 40],
      rotation: [10, 20, 30],
      dimensions: { ...original.dimensions },
    });
    const turned = withPartTransform(original, { position: original.position, rotation: [0, 0, 90] });

    expect(moved.sheet).toBe(original.sheet);
    expect(turned.sheet).toBe(original.sheet);
    expect(moved.sheetTransform).toBe(original.sheetTransform);
  });

  it('returns a scaled sheet to printing while keeping its affine physical geometry', () => {
    const resized = withPartTransform(original, {
      position: original.position,
      rotation: original.rotation,
      dimensions: { ...original.dimensions, depth: 9 },
    });

    expect(resized.dimensions.depth).toBe(9);
    expect(resized.sheet).toBeUndefined();
    expect(resized.mechanicalTag).toBe('3D Printed PLA/PETG');
    expect(resized.sheetTransform).toBe(original.sheetTransform);
    expect(isPrinted(resized)).toBe(true);
    expect(original.sheet?.thicknessMm).toBeCloseTo(3.18);
  });

  it.each(['CNC Aluminum', 'Laser-Cut Acrylic/Carbon'])(
    'clears legacy %s stock metadata after scaling',
    (mechanicalTag) => {
      const legacy = { ...original, sheet: undefined, mechanicalTag };
      const resized = withPartTransform(legacy, {
        position: legacy.position,
        rotation: legacy.rotation,
        dimensions: { ...legacy.dimensions, width: 160 },
      });

      expect(resized.mechanicalTag).toBe('3D Printed PLA/PETG');
      expect(resized.sheetTransform).toBe(legacy.sheetTransform);
      expect(isPrinted(resized)).toBe(true);
    },
  );
});

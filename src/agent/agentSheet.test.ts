import { describe, expect, it } from 'vitest';
import { applySpec, snapshotScene, specToPart, type AgentPartSpec } from './agentScene';
import { sheetSpec } from './agentSheet';

const sheet = { material: 'aluminum-6061' as const, thicknessMm: 3.18 };
const plate = () => specToPart({ id: 'chest', size: [100, 60, 2.6] });

describe('agent sheet parts', () => {
  it('sets a sheet material and changes the geometry to stock thickness', () => {
    const original = plate();
    const next = applySpec(original, { id: 'chest', sheet });

    expect(next.sheet).toEqual(sheet);
    expect(next.dimensions).toMatchObject({ width: 100, height: 3.18, depth: 60 });
    expect(original.dimensions.height).toBeCloseTo(2.6);
    expect(snapshotScene([next]).parts[0].sheet).toEqual(sheet);
    expect(snapshotScene([next]).parts[0].material).toBeUndefined();
  });

  it('snaps requested thickness and creates a sheet through the same path', () => {
    const next = specToPart({ id: 'plate', size: [100, 60, 2.6], sheet: { ...sheet, thicknessMm: 2.7 } });

    expect(next.sheet).toEqual({ ...sheet, thicknessMm: 2.54 });
    expect(next.dimensions.height).toBeCloseTo(2.54);
  });

  it('snaps a requested thickness beyond the stock range', () => {
    const next = applySpec(plate(), { id: 'chest', sheet: { ...sheet, thicknessMm: 100 } });

    expect(next.sheet?.thicknessMm).toBeCloseTo(19.05);
    expect(next.dimensions.height).toBeCloseTo(19.05);
  });

  it('converts the legacy aluminum request to a sheet material', () => {
    const next = applySpec(plate(), { id: 'chest', material: 'aluminum' });

    expect(next.sheet).toEqual({ ...sheet, thicknessMm: 2.54 });
    expect(next.dimensions.height).toBeCloseTo(2.54);
  });

  it('converts legacy laser cut to carbon fiber and clears sheet when selecting print material', () => {
    const next = applySpec(plate(), { id: 'chest', material: 'laser_cut' });

    expect(next.sheet).toEqual({ material: 'carbon-fiber', thicknessMm: 3 });
    expect(applySpec(next, { id: 'chest', material: 'petg' }).sheet).toBeUndefined();
  });

  it('keeps stock thickness when resizing a primitive sheet', () => {
    const initial = applySpec(plate(), { id: 'chest', sheet });
    const resized = applySpec(initial, { id: 'chest', size: [120, 80, 5] });

    expect(resized.sheet).toEqual(sheet);
    expect(resized.dimensions).toMatchObject({ width: 120, height: 3.18, depth: 80 });
  });

  it('returns a sheet to printing after an agent changes its edges', () => {
    const initial = applySpec(plate(), { id: 'chest', sheet });
    const spec: AgentPartSpec = { id: 'chest', size: [120, 80, 5], edges: { kind: 'chamfer', mm: 1 } };
    const changed = applySpec(initial, sheetSpec(initial, spec));

    expect(changed.sheet).toBeUndefined();
    expect(changed.mechanicalTag).toBe('3D Printed PLA/PETG');
    expect(changed.edges).toEqual({ kind: 'chamfer', mm: 1 });
  });

  it.each([
    null,
    {},
    { material: 'steel', thicknessMm: 3 },
    { ...sheet, thicknessMm: -1 },
    { ...sheet, thicknessMm: NaN },
    { ...sheet, thicknessMm: '3' },
  ])('rejects malformed sheet input %j', (value) => {
    const spec = { id: 'chest', sheet: value } as unknown as AgentPartSpec;

    expect(() => applySpec(plate(), spec)).toThrow(/sheet|thickness|material/i);
  });
});

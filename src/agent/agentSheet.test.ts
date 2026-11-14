import { describe, expect, it } from 'vitest';
import { applySpec, snapshotScene, specToPart } from './agentScene';

const chest = () =>
  specToPart({ id: 'chest', name: 'Chest plate', shape: 'box', size: [120, 2.9, 80], position: [0, 0, 100] });

describe('the agent cuts a part from sheet', () => {
  it('makes the chest plate aluminum, snapped to stock, and get_scene says so', () => {
    const plate = applySpec(chest(), { id: 'chest', sheet: { material: 'aluminum' } });

    expect(plate.sheet).toEqual({ material: 'aluminum', thicknessMm: 3 });
    expect(plate.dimensions).toMatchObject({ width: 120, height: 80, depth: 3 });
    expect(snapshotScene([plate]).parts[0]).toMatchObject({ sheet: { material: 'aluminum', thickness: 3 } });
  });

  it('takes a thickness, and prints the part again on null or a filament', () => {
    const carbon = applySpec(chest(), { id: 'chest', sheet: { material: 'carbon', thickness: 2.2 } });

    expect(carbon.sheet).toEqual({ material: 'carbon', thicknessMm: 2 });
    expect(applySpec(carbon, { id: 'chest', sheet: null }).sheet).toBeUndefined();
    expect(applySpec(carbon, { id: 'chest', material: 'petg' }).sheet).toBeUndefined();
    expect(snapshotScene([chest()]).parts[0]).not.toHaveProperty('sheet');
  });

  it('adds a part already cut from sheet', () => {
    const added = specToPart({ id: 'hip', shape: 'box', size: [60, 40, 6.2], sheet: { material: 'aluminum' } });

    expect(added.sheet).toEqual({ material: 'aluminum', thicknessMm: 6.35 });
    expect(added.dimensions.height).toBeCloseTo(6.35, 3);
  });
});

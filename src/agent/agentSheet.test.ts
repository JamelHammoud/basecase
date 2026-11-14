import { describe, expect, it } from 'vitest';
import { applySpec, snapshotScene, specToPart } from './agentScene';

const plate = specToPart({ id: 'chest', name: 'Chest Plate', shape: 'box', size: [80, 60, 3] });
const sheet = { thicknessMm: 3, areaMm2: 4800, outline: [], holes: [] };
const measured = {
  chest: { min: [0, 0, 0] as [number, number, number], max: [80, 3, 60] as [number, number, number], sheet },
};

describe('the agent and sheet parts', () => {
  it('makes the chest plate aluminum and reports it in get_scene', () => {
    const next = applySpec(plate, { id: 'chest', sheet: 'aluminum' });
    const [entry] = snapshotScene([next], measured).parts;

    expect(next.sheet).toEqual({ material: 'aluminum' });
    expect(entry).toMatchObject({ sheet: { material: 'aluminum', mm: 3 } });
    expect(entry.material).toBeUndefined();
  });

  it('prints it again with null, also when an old tag made it sheet', () => {
    const old = { ...plate, mechanicalTag: 'CNC Aluminum' };

    expect(snapshotScene([old], measured).parts[0]).toMatchObject({ sheet: { material: 'aluminum', mm: 3 } });
    expect(applySpec(old, { id: 'chest', sheet: null })).toMatchObject({ sheet: undefined, mechanicalTag: undefined });
    expect(
      applySpec({ ...plate, sheet: { material: 'carbon' } }, { id: 'chest', material: 'petg' }).sheet,
    ).toBeUndefined();
  });

  it('reports a sheet part that isn’t flat', () => {
    const cube = applySpec(plate, { id: 'chest', sheet: 'aluminum' });
    const lumpy = { chest: { min: measured.chest.min, max: [20, 20, 20] as [number, number, number] } };

    expect(snapshotScene([cube], lumpy).parts[0]).toMatchObject({ sheet: { material: 'aluminum', flat: false } });
  });

  it('turns down sheet on a part that can’t be cut', () => {
    const washer = { ...plate, id: 'washer', kind: 'hardware' as const };

    expect(() => applySpec(washer, { id: 'washer', sheet: 'aluminum' })).toThrow("can't be cut from sheet");
    expect(() => specToPart({ id: 'bat', shape: 'box', supply: 'supply:lipo-3s-2200', sheet: 'carbon' })).toThrow(
      "can't be cut from sheet",
    );
  });

  it('turns down a sheet it doesn’t know', () => {
    expect(() => applySpec(plate, { id: 'chest', sheet: 'steel' as 'aluminum' })).toThrow('Unknown sheet "steel"');
  });
});

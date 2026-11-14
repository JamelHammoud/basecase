import { describe, expect, it, vi } from 'vitest';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { snapshotScene } from '../agent/agentScene';
import { solidPart } from '../sheet/sheet.fixtures';
import { sheetUpdate } from './agentSheet';

const plate = solidPart({ id: 'chest-plate', kind: 'box', dimensions: { width: 120, height: 3, depth: 80 } });
const viewportWith = (thicknessMm: number | null) =>
  ({
    sheetProfiles: async (ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => [id, thicknessMm ? { thicknessMm, outline: [], holes: [], areaMm2: 1 } : null]),
      ),
  }) as unknown as Viewport3DHandle;

describe('agent sheet updates', () => {
  it('makes a flat plate aluminum at the nearest stock thickness', async () => {
    const { patch, problem } = await sheetUpdate(plate, { sheet: 'aluminum' }, viewportWith(3));

    expect(problem).toBeUndefined();
    expect(patch.sheet).toEqual({ material: 'aluminum', thicknessMm: 3.18 });
  });

  it('refuses a part that is not flat and leaves it printed', async () => {
    const { patch, problem } = await sheetUpdate(plate, { sheet: 'carbon' }, viewportWith(null));

    expect(patch).toEqual({});
    expect(problem).toMatch(/isn't a flat plate/);
  });

  it('refuses a sheet sent with a resize, so the thickness is never read off the old shape', async () => {
    const measured = vi.fn(async () => ({}));
    const viewport = { sheetProfiles: measured } as unknown as Viewport3DHandle;
    const { patch, problem } = await sheetUpdate(plate, { sheet: 'aluminum', size: [120, 80, 6] }, viewport);

    expect(patch).toEqual({});
    expect(problem).toMatch(/size changed its shape.*own update_parts call/);
    expect(measured).not.toHaveBeenCalled();
  });

  it('prints an old CNC-tagged part again on null', async () => {
    const { patch } = await sheetUpdate({ ...plate, mechanicalTag: 'CNC Aluminum' }, { sheet: null }, viewportWith(3));

    expect(patch).toEqual({ sheet: undefined, mechanicalTag: undefined });
  });

  it('reports the sheet in get_scene instead of a material', () => {
    const [entry] = snapshotScene([{ ...plate, sheet: { material: 'acrylic', thicknessMm: 3 } }]).parts;

    expect(entry).toMatchObject({ sheet: 'acrylic:3' });
    expect(entry).not.toHaveProperty('material');
  });
});

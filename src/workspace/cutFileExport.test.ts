import { describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import type { MeshMeasure } from '../three/meshMeasure';
import { cutFileJob } from './cutFileExport';

const plate: ScenePart = {
  id: 'chest',
  name: 'Chest plate',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [0, 20, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 80, height: 3, depth: 60 },
  color: '#aaaaaa',
  note: '',
  visible: true,
  locked: false,
  sheet: { material: 'aluminum-6061', thicknessMm: 3 },
};

describe('cut file export job', () => {
  it('measures only sheet solids and passes their profiles without mesh payloads', async () => {
    const profile = {
      thicknessMm: 3,
      outline: [
        [0, 0],
        [80, 0],
        [80, 60],
        [0, 60],
      ],
      holes: [],
      normal: [0, 1, 0],
    };
    const measure = vi.fn().mockResolvedValue({ chest: { sheet: profile } });
    const printed = { ...plate, id: 'printed', sheet: undefined };
    const reference = { ...plate, id: 'reference', role: 'reference' as const };
    const meshed = {
      ...plate,
      mesh: { positions: [1, 2, 3], indices: [0], baseSize: [1, 1, 1] as [number, number, number] },
    };
    const job = await cutFileJob([meshed, printed, reference], measure);

    expect(measure).toHaveBeenCalledExactlyOnceWith(['chest']);
    expect(job).toHaveLength(1);
    expect(job[0].profile).toEqual(profile);
    expect(job[0].part.name).toBe('Chest plate');
    expect(job[0].part).not.toHaveProperty('mesh');
  });

  it('rejects the whole job when a saved sheet is no longer flat', async () => {
    await expect(cutFileJob([plate], async () => ({}))).rejects.toThrow('Chest plate');
  });

  it('does not request geometry when the scene has no sheet solids', async () => {
    const measure = vi.fn<() => Promise<Record<string, MeshMeasure>>>().mockResolvedValue({});

    expect(await cutFileJob([{ ...plate, sheet: undefined }], measure)).toEqual([]);
    expect(measure).not.toHaveBeenCalled();
  });
});

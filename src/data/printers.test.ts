import { describe, expect, it } from 'vitest';
import { bedOf } from '../print/bed';
import { customModel, PRINTER_MODELS, printerModel, slicerOrder } from './printers';

const PRUSA = [
  { id: 'prusa-core-one', size: [250, 220, 270] },
  { id: 'prusa-mk4s', size: [250, 210, 220] },
  { id: 'prusa-xl', size: [360, 360, 360] },
];

describe('printer catalog', () => {
  it.each(PRUSA)('has the $id with its build volume, a 0.4 mm machine and presets', ({ id, size }) => {
    const model = printerModel(id)!;
    const bed = bedOf(model);

    expect(model.maker).toBe('Prusa');
    expect([bed.width, bed.depth, bed.height]).toEqual(size);
    expect(model.nozzles).toContain(0.4);
    expect(model.presets!.machine).toMatch(/0\.4 nozzle$/);
    expect(model.presets!.process).toBeTruthy();
    expect(model.presets!.processes.map((p) => p.name)).toContain(model.presets!.process);
    expect(Object.keys(model.presets!.filaments)).toEqual(expect.arrayContaining(['PLA', 'PETG', 'TPU']));
    expect(model.source?.slicer).toBe('orca');
  });

  it('takes the XL as its single-tool printer and leaves multi-tool ones out', () => {
    const names = PRINTER_MODELS.map((m) => m.name);

    expect(names).toContain('Prusa XL');
    expect(names.filter((n) => /\b(MMU\d*|INDX|\d+T)\b/.test(n))).toEqual([]);
  });

  it('has the Bambu Lab H3C from Bambu Studio', () => {
    expect(printerModel('bambu-lab-h3c')?.source?.slicer).toBe('bambu');
  });

  it('records the slicer and version every printer came from', () => {
    for (const model of PRINTER_MODELS)
      expect(model.source).toEqual({ slicer: expect.any(String), version: expect.any(String) });
  });

  it('keeps Bambu Studio as the source for printers both slicers have', () => {
    expect(printerModel('prusa-mini')?.source?.slicer).toBe('bambu');
  });
});

describe('slicerOrder', () => {
  it('slices OrcaSlicer printers with OrcaSlicer only', () => {
    expect(slicerOrder(printerModel('prusa-core-one')!)).toEqual(['orca']);
  });

  it('prefers Bambu Studio for Bambu printers and OrcaSlicer for other makers', () => {
    expect(slicerOrder(printerModel('bambu-lab-p1s')!)).toEqual(['bambu', 'orca']);
    expect(slicerOrder(printerModel('prusa-mini')!)).toEqual(['orca', 'bambu']);
    expect(slicerOrder(customModel({ width: 200, depth: 200, height: 200 }))).toEqual(['orca', 'bambu']);
  });
});

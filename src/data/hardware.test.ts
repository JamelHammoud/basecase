import { describe, expect, it } from 'vitest';
import { hardwareKey, specFromHardwareKey } from '../utils/bom';
import { PART_CATALOG, catalogItemFromKey, catalogKey, catalogRef } from './catalog';
import {
  HARDWARE_TYPES,
  driveOptions,
  hardwareDimensions,
  hardwareHoleRows,
  hardwareName,
  makeSpec,
  screwHead,
  screwStandard,
} from './hardware';

describe('hardware catalog keys', () => {
  it('round-trips every hardware type, size and drive', () => {
    for (const t of HARDWARE_TYPES) {
      for (const size of t.sizes) {
        for (const drive of driveOptions(t.type).length ? driveOptions(t.type) : [undefined]) {
          const spec = makeSpec(t.type, { size, length: 13.5, finish: t.finishes.at(-1), drive });
          const item = catalogItemFromKey(
            catalogRef({ ...PART_CATALOG.find((c) => c.hardware?.type === t.type)!, hardware: spec }),
          )!;

          expect(item.hardware).toEqual(spec);
          expect(item.name).toBe(hardwareName(spec));
          expect(specFromHardwareKey(hardwareKey(spec))).toEqual(spec);
        }
      }
    }
  });

  it('round-trips every catalog item', () => {
    for (const item of PART_CATALOG) expect(catalogKey(catalogItemFromKey(catalogRef(item))!)).toBe(catalogKey(item));
  });

  it('parses refs with blank fields to the defaults', () => {
    expect(catalogItemFromKey('hardware:socket_head|M4|17|black|torx')?.name).toBe('M4 × 17 Torx Socket Head Screw');
    expect(catalogItemFromKey('hardware:pan_head|M3||')?.hardware).toEqual(makeSpec('pan_head', { size: 'M3' }));
    expect(catalogItemFromKey('nope')).toBeUndefined();
  });
});

describe('hardware geometry', () => {
  it('picks the ISO table for standard drives and a commercial recess otherwise', () => {
    const torx = makeSpec('socket_head', { size: 'M3', length: 12, finish: 'black', drive: 'torx' });
    const slotted = makeSpec('button_head', { size: 'M3', length: 12, finish: 'black', drive: 'slotted' });

    expect(screwStandard(torx)).toBe('ISO 14579');
    expect(screwHead(torx)?.recess).toEqual({ kind: 'torx', size: 'T10' });
    expect(screwStandard(slotted)).toBe('ISO 7380-1 head');
    expect(screwHead(slotted)?.recess).toEqual({ kind: 'slot', width: 1 });
  });

  it('sizes a socket head screw and its holes', () => {
    const spec = makeSpec('socket_head', { size: 'M3', length: 12 });

    expect(hardwareDimensions(spec)).toEqual({ width: 5.5, height: 15, depth: 5.5 });
    expect(hardwareHoleRows(spec)).toEqual([
      { label: 'Clearance', value: 'Ø3.4', unit: 'mm' },
      { label: 'Counterbore', value: 'Ø6.1 × 3.3', unit: 'mm' },
      { label: 'Tap drill', value: 'Ø2.5', unit: 'mm' },
    ]);
  });
});

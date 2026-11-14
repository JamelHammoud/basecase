import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { detectSheet } from './detect';
import { cutFileName, cutFilesZip, sheetDxf } from './dxf';
import { sheetOf, snapThickness } from './materials';
import { HOLE_CENTERS, HOLE_RADIUS, plateWithHoles, pocketedBox, solid, trianglesOf } from './sheet.fixtures';

const dxfLoops = (dxf: string) =>
  dxf
    .split('0\nPOLYLINE\n')
    .slice(1)
    .map((block) =>
      block
        .split('0\nVERTEX\n')
        .slice(1)
        .map((v) => {
          const [, x, y] = /^8\n0\n10\n(-?[\d.]+)\n20\n(-?[\d.]+)\n/.exec(v)!;

          return [Number(x), Number(y)];
        }),
    );

describe('sheet detection', () => {
  it('finds a 3 mm plate with four holes', async () => {
    const profile = detectSheet(trianglesOf(await plateWithHoles()));

    expect(profile).not.toBeNull();
    expect(profile!.axis).toBe(1);
    expect(profile!.thicknessMm).toBeCloseTo(3, 3);
    expect(profile!.holes).toHaveLength(4);
    expect(profile!.outline).toHaveLength(4);
  });

  it('writes the outline and holes of the face within 0.01 mm', async () => {
    const loops = dxfLoops(sheetDxf(detectSheet(trianglesOf(await plateWithHoles()))!));
    const [outline, ...holes] = loops;

    expect(outline).toHaveLength(4);

    for (const [x, y] of outline) {
      expect(Math.min(Math.abs(x), Math.abs(x - 60))).toBeLessThan(0.01);
      expect(Math.min(Math.abs(y), Math.abs(y - 40))).toBeLessThan(0.01);
    }

    const centers = holes.map((h) => [
      h.reduce((s, p) => s + p[0], 0) / h.length - 30,
      h.reduce((s, p) => s + p[1], 0) / h.length - 20,
    ]);

    for (const [cx, cz] of HOLE_CENTERS) {
      const i = centers.findIndex(([x, y]) => Math.hypot(x - cx, y - cz) < 0.01);

      expect(i).toBeGreaterThanOrEqual(0);

      for (const [x, y] of holes[i])
        expect(Math.abs(Math.hypot(x - 30 - cx, y - 20 - cz) - HOLE_RADIUS)).toBeLessThan(0.01);
    }
  });

  it('turns down a box with a pocket', async () => {
    expect(detectSheet(trianglesOf(await pocketedBox()))).toBeNull();
  });

  it('turns down a block too thick for any stock sheet', () => {
    const block = solid({ id: 'block', kind: 'box', dimensions: { width: 200, height: 30, depth: 200 } });

    expect(detectSheet(trianglesOf(block))).toBeNull();
  });

  it('finds a plain box plate on whichever axis is thin', () => {
    const upright = solid({ id: 'upright', kind: 'box', dimensions: { width: 4, height: 50, depth: 30 } });

    expect(detectSheet(trianglesOf(upright))).toMatchObject({ axis: 0, thicknessMm: 4, holes: [] });
  });
});

describe('stock thickness', () => {
  it('snaps a thickness off stock to the nearest size', () => {
    expect([2.9, 6.2].map((mm) => snapThickness('aluminum', mm))).toEqual([3, 6.35]);
    expect(snapThickness('carbon', 2.2)).toBe(2);
    expect(snapThickness('acrylic', 40)).toBe(12);
  });

  it('reads the old CNC aluminum tag as an aluminum sheet', () => {
    const tagged = solid({ id: 'old', kind: 'box', mechanicalTag: 'CNC Aluminum' });

    expect(sheetOf(tagged)).toEqual({ material: 'aluminum', thicknessMm: 3 });
  });
});

describe('cut files', () => {
  it('keeps path characters out of the file name', () => {
    expect(cutFileName('../../etc/Chest: plate?', { material: 'aluminum', thicknessMm: 3 })).toBe(
      'etc-chest-plate-aluminum-3mm.dxf',
    );
  });

  it('gives byte-identical DXF and zip for the same part', async () => {
    const [a, b] = await Promise.all([plateWithHoles(), plateWithHoles()]);
    const first = sheetDxf(detectSheet(trianglesOf(a))!);
    const again = sheetDxf(detectSheet(trianglesOf(b))!);

    expect(again).toBe(first);
    expect(first.startsWith('0\nSECTION')).toBe(true);
    expect(first.endsWith('0\nEOF\n')).toBe(true);

    const zip = (dxf: string) => cutFilesZip([{ name: 'plate-aluminum-3mm.dxf', dxf }]);

    expect(zip(again)).toEqual(zip(first));
  });

  it('keeps two parts with the same name as two files', () => {
    const files = unzipSync(
      cutFilesZip([
        { name: 'plate-aluminum-3mm.dxf', dxf: 'a' },
        { name: 'plate-aluminum-3mm.dxf', dxf: 'b' },
      ]),
    );

    expect(Object.keys(files)).toEqual(['plate-aluminum-3mm.dxf', 'plate-aluminum-3mm-2.dxf']);
    expect(strFromU8(files['plate-aluminum-3mm-2.dxf'])).toBe('b');
  });
});

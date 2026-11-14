import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { sheetProfile, type Point2 } from './detect';
import { cutFileName, cutFilesZip, sheetDxf } from './dxf';
import { partSheet, sheetFor, stockThickness } from './materials';
import { HOLE_CENTERS, PLATE, platePart, pocketedBox, trianglesOf } from './sheet.fixtures';

function dxfLoops(dxf: string): Point2[][] {
  const lines = dxf.split('\n');
  const loops: Point2[][] = [];

  for (let i = 0; i < lines.length - 1; i += 2) {
    if (lines[i] !== '0') continue;

    if (lines[i + 1] === 'POLYLINE') loops.push([]);

    if (lines[i + 1] === 'VERTEX') loops[loops.length - 1].push([Number(lines[i + 5]), Number(lines[i + 7])]);
  }

  return loops;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.01;
const corners = (w: number, d: number): Point2[] => [
  [0, 0],
  [w, 0],
  [w, d],
  [0, d],
];

describe('sheet parts', () => {
  it('finds a 3 mm plate with four holes', async () => {
    const profile = sheetProfile(trianglesOf(await platePart()));

    expect(profile?.thicknessMm).toBeCloseTo(3, 3);
    expect(profile?.holes).toHaveLength(4);
  });

  it('writes the outline and holes on the face within 0.01 mm', async () => {
    const profile = sheetProfile(trianglesOf(await platePart()))!;
    const [outline, ...holes] = dxfLoops(sheetDxf(profile));
    const expectedCorners = corners(PLATE.width, PLATE.depth);
    const centers = HOLE_CENTERS.map(([x, z]): Point2 => [x + PLATE.width / 2, PLATE.depth / 2 - z]);
    const r = PLATE.holeDiameter / 2;

    expect(outline).toHaveLength(4);
    expect(outline.every((p) => expectedCorners.some((c) => near(p[0], c[0]) && near(p[1], c[1])))).toBe(true);
    expect(holes).toHaveLength(4);

    for (const hole of holes) {
      const center = centers.find((c) => near(Math.hypot(hole[0][0] - c[0], hole[0][1] - c[1]), r));

      expect(center).toBeDefined();
      expect(hole.every(([x, y]) => near(Math.hypot(x - center![0], y - center![1]), r))).toBe(true);
    }
  });

  it('says a box with a pocket is not a sheet', async () => {
    expect(sheetProfile(trianglesOf(await pocketedBox()))).toBeNull();
  });

  it('snaps a thickness off stock to the nearest size', () => {
    expect(stockThickness(3, 'aluminum')).toBeCloseTo(3.18, 6);
    expect(stockThickness(3.1, 'acrylic')).toBeCloseTo(3, 6);
    expect(stockThickness(5.6, 'carbon')).toBeCloseTo(5, 6);
    expect(sheetFor('aluminum', 6.1)).toEqual({ material: 'aluminum', thicknessMm: 6.35 });
  });

  it('reads the old CNC and laser-cut tags as sheet', () => {
    expect(partSheet({ mechanicalTag: 'CNC Aluminum' })).toEqual({ material: 'aluminum' });
    expect(partSheet({ mechanicalTag: 'Laser-Cut Acrylic/Carbon' })).toEqual({ material: 'acrylic' });
    expect(partSheet({ mechanicalTag: '3D Printed PLA/PETG' })).toBeUndefined();
  });

  it('keeps path characters out of a cut file name', () => {
    const name = cutFileName('../../etc/pass:wd\\Shin<Plate>', { material: 'aluminum' }, 3.18);

    expect(name).toBe('etc-pass-wd-Shin-Plate-6061-aluminum-3.18mm.dxf');
    expect(name).not.toMatch(/[/\\:<>]|\.\./);
  });

  it('writes the same part to the same bytes', async () => {
    const profile = () => sheetProfile(trianglesOf(plate))!;
    const plate = await platePart();
    const file = { name: plate.name, sheet: { material: 'aluminum' as const, thicknessMm: 3.18 } };
    const a = cutFilesZip([{ ...file, profile: profile() }]);
    const b = cutFilesZip([{ ...file, profile: profile() }]);

    expect(sheetDxf(profile())).toBe(sheetDxf(profile()));
    expect(a).toEqual(b);

    const files = unzipSync(a);

    expect(Object.keys(files)).toEqual(['Shin-Plate-6061-aluminum-3.18mm.dxf']);
    expect(strFromU8(files['Shin-Plate-6061-aluminum-3.18mm.dxf']).startsWith('0\nSECTION')).toBe(true);
  });
});

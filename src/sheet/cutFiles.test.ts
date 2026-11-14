import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { exportCutFiles } from './cutFiles';
import { detectSheet } from './detectSheet';
import { plateTriangles, sheetPart } from './sheet.fixtures';

const part = sheetPart({ name: '../Chest\\plate:/test', sheet: { material: 'aluminum-6061', thicknessMm: 3 } });
const profile = () => detectSheet(plateTriangles())!;

describe('cut files', () => {
  it('writes closed millimeter polylines matching outline and holes within 0.01 mm', () => {
    const shape = profile();
    const files = unzipSync(exportCutFiles([{ part, profile: shape }]));
    const dxf = strFromU8(Object.values(files)[0]);
    const pairs = dxf.trim().split('\n');
    const xs = pairs.filter((_, i) => i % 2 === 1 && pairs[i - 1] === '10').map(Number);
    const ys = pairs.filter((_, i) => i % 2 === 1 && pairs[i - 1] === '20').map(Number);
    const expected = [shape.outline, ...shape.holes].flat();

    expect(dxf.startsWith('0\nSECTION')).toBe(true);
    expect(dxf).toContain('9\n$INSUNITS\n70\n4\n');
    expect(dxf.match(/0\nLWPOLYLINE\n/g)).toHaveLength(5);
    expect(dxf.match(/70\n1\n/g)).toHaveLength(5);
    expect(xs).toHaveLength(expected.length);
    expected.forEach(([x, y], i) => {
      expect(Math.abs(xs[i] - x)).toBeLessThan(0.01);
      expect(Math.abs(ys[i] - y)).toBeLessThan(0.01);
    });
  });

  it('rejects missing material and thickness that disagrees with geometry', () => {
    expect(() => exportCutFiles([{ part: { ...part, sheet: undefined }, profile: profile() }])).toThrow(/material/);
    expect(() =>
      exportCutFiles([{ part: { ...part, sheet: { material: 'acrylic', thicknessMm: 4.5 } }, profile: profile() }]),
    ).toThrow(/thickness/);
  });

  it('sanitizes path characters, avoids collisions and produces identical bytes', () => {
    const input = [
      { part, profile: profile() },
      { part: { ...part, id: 'other' }, profile: profile() },
    ];
    const first = exportCutFiles(input);
    const files = Object.keys(unzipSync(first));

    expect(files).toHaveLength(2);
    expect(files.every((name) => !/[\\/:]/.test(name) && !name.startsWith('.'))).toBe(true);
    expect(files[0]).toContain('aluminum-6061_3mm');
    expect(exportCutFiles(input)).toEqual(first);
  });
});

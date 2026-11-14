import { strToU8, zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from '../types/sheet';
import { sheetOf, SHEET_MATERIALS } from './materials';

export type CutFilePart = Pick<ScenePart, 'id' | 'name' | 'dimensions' | 'sheet' | 'mechanicalTag' | 'role'>;
export interface CutFileInput {
  part: CutFilePart;
  profile: SheetProfile;
}

const decimal = (value: number) => Number(value.toFixed(6)).toString();
const safeName = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96) || 'part';

function polyline(points: SheetProfile['outline'], layer: string): string {
  const vertices = points.flatMap(([x, y]) => ['10', decimal(x), '20', decimal(y)]);

  return (
    [
      '0',
      'LWPOLYLINE',
      '100',
      'AcDbEntity',
      '8',
      layer,
      '100',
      'AcDbPolyline',
      '90',
      String(points.length),
      '70',
      '1',
      ...vertices,
    ].join('\n') + '\n'
  );
}

export function sheetDxf(profile: SheetProfile): string {
  return (
    '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n' +
    polyline(profile.outline, 'OUTLINE') +
    profile.holes.map((hole) => polyline(hole, 'HOLES')).join('') +
    '0\nENDSEC\n0\nEOF\n'
  );
}

function checkedSetting({ part, profile }: CutFileInput) {
  const sheet = sheetOf(part, profile);
  const loops = [profile.outline, ...profile.holes];

  if (!sheet || !Object.hasOwn(SHEET_MATERIALS, sheet.material) || part.role !== 'solid')
    throw new Error('Choose a sheet material before exporting cut files.');

  if (
    !Number.isFinite(sheet.thicknessMm) ||
    sheet.thicknessMm <= 0 ||
    !Number.isFinite(profile.thicknessMm) ||
    Math.abs(sheet.thicknessMm - profile.thicknessMm) > 0.01
  )
    throw new Error('Sheet thickness must match the measured part before exporting.');

  if (
    loops.some((loop) => loop.length < 3 || loop.some((point) => point.length !== 2 || !point.every(Number.isFinite)))
  )
    throw new Error('Measure a closed sheet profile before exporting.');

  return sheet;
}

export function exportCutFiles(input: CutFileInput[]): Uint8Array {
  const entries: Zippable = Object.create(null);
  const names = new Set<string>();
  const parts = [...input].sort((a, b) => (a.part.id < b.part.id ? -1 : Number(a.part.id > b.part.id)));

  for (const item of parts) {
    const sheet = checkedSetting(item);
    const base = `${safeName(item.part.name)}_${sheet.material}_${decimal(sheet.thicknessMm)}mm`;
    let suffix = 1;
    let name = `${base}.dxf`;

    while (names.has(name.toLowerCase())) name = `${base}_${++suffix}.dxf`;

    names.add(name.toLowerCase());
    entries[name] = [strToU8(sheetDxf(item.profile)), { mtime: new Date(1980, 0, 1), level: 6 }];
  }

  return zipSync(entries);
}

import { strToU8, zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import type { PartSheet } from '../types/print';
import { fileSafe } from '../workspace/helpers';
import type { Point2, SheetProfile } from './detect';

const HEADER = [
  '0',
  'SECTION',
  '2',
  'HEADER',
  '9',
  '$ACADVER',
  '1',
  'AC1009',
  '9',
  '$INSUNITS',
  '70',
  '4',
  '0',
  'ENDSEC',
];
const ZIP_TIME = new Date('2026-01-01T00:00:00Z');

const num = (v: number) => {
  const fixed = v.toFixed(4);

  return fixed === '-0.0000' ? '0.0000' : fixed;
};

function polyline(loop: Point2[]): string[] {
  const head = ['0', 'POLYLINE', '8', '0', '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', '1'];
  const vertices = loop.flatMap(([x, y]) => ['0', 'VERTEX', '8', '0', '10', num(x), '20', num(y), '30', '0.0']);

  return [...head, ...vertices, '0', 'SEQEND', '8', '0'];
}

export function sheetDxf(profile: Pick<SheetProfile, 'outline' | 'holes'>): string {
  const entities = [profile.outline, ...profile.holes].flatMap(polyline);

  return [...HEADER, '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
}

export const cutFileName = (name: string, sheet: PartSheet) =>
  `${fileSafe(name)}-${sheet.material}-${sheet.thicknessMm}mm.dxf`;

export interface CutFile {
  name: string;
  dxf: string;
}

function freeName(name: string, taken: Zippable): string {
  const stem = name.replace(/\.dxf$/, '');
  let n = 1;
  let next = name;

  while (taken[next]) next = `${stem}-${++n}.dxf`;

  return next;
}

export function cutFilesZip(files: CutFile[]): Uint8Array {
  const entries: Zippable = {};

  for (const file of files) {
    const name = freeName(file.name, entries);

    entries[name] = [strToU8(file.dxf), { mtime: ZIP_TIME }];
  }

  return zipSync(entries);
}

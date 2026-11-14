import { strToU8, zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import type { Point2, SheetProfile } from './detect';
import { SHEET_MATERIALS, type PartSheet } from './materials';

const MM_UNITS = 4;
const ZIP_TIME = new Date(1980, 0, 1);

const num = (v: number) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4);

const pairs = (codes: Array<[number, string | number]>) => codes.map(([c, v]) => `${c}\n${v}\n`).join('');

function polyline(loop: Point2[]): string {
  return (
    pairs([
      [0, 'POLYLINE'],
      [8, 'CUT'],
      [66, 1],
      [70, 1],
      [10, num(0)],
      [20, num(0)],
      [30, num(0)],
    ]) +
    loop
      .map(([x, y]) =>
        pairs([
          [0, 'VERTEX'],
          [8, 'CUT'],
          [10, num(x)],
          [20, num(y)],
          [30, num(0)],
        ]),
      )
      .join('') +
    pairs([
      [0, 'SEQEND'],
      [8, 'CUT'],
    ])
  );
}

export function sheetDxf(profile: SheetProfile): string {
  return (
    pairs([
      [0, 'SECTION'],
      [2, 'HEADER'],
      [9, '$ACADVER'],
      [1, 'AC1009'],
      [9, '$INSUNITS'],
      [70, MM_UNITS],
      [0, 'ENDSEC'],
      [0, 'SECTION'],
      [2, 'ENTITIES'],
    ]) +
    [profile.outline, ...profile.holes].map(polyline).join('') +
    pairs([
      [0, 'ENDSEC'],
      [0, 'EOF'],
    ])
  );
}

const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9.]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');

export function cutFileName(name: string, sheet: PartSheet, thicknessMm: number): string {
  const part = slug(name).slice(0, 60) || 'part';

  return `${part}-${slug(SHEET_MATERIALS[sheet.material].name)}-${Number(thicknessMm.toFixed(2))}mm.dxf`;
}

export interface CutFile {
  name: string;
  sheet: PartSheet;
  profile: SheetProfile;
}

function uniqueName(name: string, taken: Set<string>): string {
  let unique = name;
  let n = 1;

  while (taken.has(unique)) {
    n += 1;
    unique = name.replace(/\.dxf$/, `-${n}.dxf`);
  }

  taken.add(unique);

  return unique;
}

export function cutFilesZip(files: CutFile[]): Uint8Array {
  const taken = new Set<string>();
  const entries: Zippable = {};

  for (const f of files) {
    const name = uniqueName(cutFileName(f.name, f.sheet, f.sheet.thicknessMm ?? f.profile.thicknessMm), taken);

    entries[name] = [strToU8(sheetDxf(f.profile)), { mtime: ZIP_TIME }];
  }

  return zipSync(entries);
}

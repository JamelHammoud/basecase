import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from './detectSheet';
import { sheetDxf } from './sheetDxf';
import { SHEET_STOCK, sheetOf, type PartSheet } from './sheetStock';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');

export function cutFileName(name: string, sheet: PartSheet): string {
  const part = slug(name) || 'part';
  const material = slug(SHEET_STOCK[sheet.material].label);

  return `${part}-${material}-${sheet.thickness}mm.dxf`;
}

function unique(name: string, taken: Set<string>): string {
  let out = name;
  let copy = 1;

  while (taken.has(out)) {
    copy += 1;
    out = name.replace(/\.dxf$/, `-${copy}.dxf`);
  }

  taken.add(out);

  return out;
}

export interface CutFiles {
  files: Record<string, Uint8Array>;
  skipped: ScenePart[];
}

export function cutFiles(parts: ScenePart[], profileOf: (p: ScenePart) => SheetProfile | null): CutFiles {
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  const skipped: ScenePart[] = [];

  for (const part of parts) {
    const sheet = sheetOf(part);

    if (!sheet || !part.visible) continue;

    const profile = profileOf(part);

    if (!profile) skipped.push(part);
    else files[unique(cutFileName(part.name, sheet), taken)] = new TextEncoder().encode(sheetDxf(profile));
  }

  return { files, skipped };
}

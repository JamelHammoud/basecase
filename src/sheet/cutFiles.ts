import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from './detectSheet';
import { sheetDxf } from './sheetDxf';
import { SHEET_STOCK, sheetOf, type PartSheet } from './sheetStock';
import { zipFolder } from '../utils/zipFolder';

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

export interface CutFile {
  id: string;
  name: string;
}

export interface CutFilesTask {
  folder: string;
  files: CutFile[];
}

export interface CutFilesResult {
  zip: Uint8Array | null;
  count: number;
  skipped: string[];
}

export function cutFileList(parts: ScenePart[]): CutFile[] {
  const taken = new Set<string>();

  return parts.flatMap((part) => {
    const sheet = sheetOf(part);

    return sheet && part.visible ? [{ id: part.id, name: unique(cutFileName(part.name, sheet), taken) }] : [];
  });
}

export function cutFilesZip(task: CutFilesTask, profileOf: (id: string) => SheetProfile | null): CutFilesResult {
  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];

  for (const { id, name } of task.files) {
    const profile = profileOf(id);

    if (profile) files[name] = new TextEncoder().encode(sheetDxf(profile));
    else skipped.push(id);
  }

  const count = Object.keys(files).length;

  return { zip: count ? zipFolder(task.folder, files) : null, count, skipped };
}

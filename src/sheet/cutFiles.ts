import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { sheetOf } from '../utils/bom';
import { zipFolder } from '../utils/zipFolder';
import { cutFileName, sheetDxf } from './dxf';
import { sheetThickness } from './stock';

export interface CutFile {
  partId: string;
  name: string;
  dxf: string;
}

function uniqueName(name: string, taken: Set<string>): string {
  const stem = name.replace(/\.dxf$/, '');
  let next = name;
  let n = 1;

  while (taken.has(next)) next = `${stem}-${++n}.dxf`;

  taken.add(next);

  return next;
}

export const sheetParts = (parts: ScenePart[]) => parts.filter((p) => !!sheetOf(p));

export function cutFiles(parts: ScenePart[], measures: Record<string, MeshMeasure | undefined>) {
  const files: CutFile[] = [];
  const skipped: string[] = [];
  const taken = new Set<string>();

  for (const p of sheetParts(parts)) {
    const material = sheetOf(p)!;
    const m = measures[p.id];

    if (!m?.sheet) {
      skipped.push(p.id);

      continue;
    }

    const name = uniqueName(cutFileName(p.name, material, sheetThickness(material, m)), taken);

    files.push({ partId: p.id, name, dxf: sheetDxf(m.sheet) });
  }

  return { files, skipped };
}

export const cutFilesZip = (folder: string, files: CutFile[]) =>
  zipFolder(folder, Object.fromEntries(files.map((f) => [f.name, new TextEncoder().encode(f.dxf)])));

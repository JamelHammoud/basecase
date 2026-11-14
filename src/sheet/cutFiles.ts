import type { ScenePart } from '../types/robotics';
import { sheetPart } from '../utils/bom';
import { detectSheet } from './detect';
import { cutFileName, sheetDxf, type CutFile } from './dxf';

export const hasSheetParts = (parts: ScenePart[]) => parts.some((p) => !!sheetPart(p));

export function cutFiles(
  parts: ScenePart[],
  trianglesOf: (id: string) => Float32Array | null,
): { files: CutFile[]; left: number } {
  const files: CutFile[] = [];
  let left = 0;

  for (const part of parts) {
    const sheet = sheetPart(part);

    if (!sheet) continue;

    const triangles = trianglesOf(part.id);
    const profile = triangles && detectSheet(triangles);

    if (profile) files.push({ name: cutFileName(part.name, sheet), dxf: sheetDxf(profile) });
    else left++;
  }

  return { files, left };
}

import { SHEET_MATERIALS, sheetOf } from '../sheet/materials';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import type { SheetMaterial } from '../types/sheet';
import type { BomLine } from './bomTypes';
import { lengthLabel } from './size';

export function sheetKey(part: ScenePart, measure?: MeshMeasure): string | undefined {
  if (!part.sheet && !measure?.sheet) return undefined;

  const sheet = sheetOf(part, measure?.sheet);

  return sheet ? `sheet:${sheet.material}|${sheet.thicknessMm}` : undefined;
}

export function describeSheet(key: string): Pick<BomLine, 'category' | 'name' | 'detail' | 'urlKind'> | null {
  const [material, thickness] = key.slice('sheet:'.length).split('|');
  const stock = SHEET_MATERIALS[material as SheetMaterial];
  const thicknessMm = Number(thickness);

  if (!stock || !Number.isFinite(thicknessMm) || thicknessMm <= 0) return null;

  return { category: 'Sheet', name: stock.label, detail: lengthLabel(thicknessMm), urlKind: 'none' };
}

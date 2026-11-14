import { isSheetMaterial, sheetChoice, type SheetMaterial } from '../sheet/materials';
import { sheetThickness } from '../sheet/stock';
import type { ScenePart } from '../types/robotics';
import { sheetOf } from '../utils/bom';
import type { PartBoxes } from './sceneBounds';

export function sheetField(sheet: SheetMaterial | null | undefined): Pick<ScenePart, 'sheet'> {
  if (sheet === undefined || sheet === null) return {};

  if (!isSheetMaterial(sheet)) throw new Error(`Unknown sheet "${String(sheet)}". Use aluminum, carbon or acrylic.`);

  return { sheet: { material: sheet } };
}

export function applySheet(next: ScenePart, sheet: SheetMaterial | null | undefined) {
  if (sheet === undefined) return;

  next.sheet = sheetField(sheet).sheet;

  if (sheetChoice({ mechanicalTag: next.mechanicalTag })) next.mechanicalTag = undefined;
}

export function sheetEntry(p: ScenePart, measured: PartBoxes[string]) {
  const material = sheetOf(p);

  if (!material) return {};

  if (!measured) return { sheet: { material } };

  if (!measured.sheet) return { sheet: { material, flat: false } };

  return { sheet: { material, mm: sheetThickness(material, measured) } };
}

import { isSheetMaterial, sheetChoice, type SheetMaterial } from '../sheet/materials';
import { sheetThickness } from '../sheet/stock';
import type { ScenePart } from '../types/robotics';
import { canCutFromSheet, sheetOf } from '../utils/bom';
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

export function cuttable(part: ScenePart, sheet: SheetMaterial | null | undefined): ScenePart {
  if (!sheet || canCutFromSheet(part)) return part;

  throw new Error(
    `"${part.id}" can't be cut from sheet: only solid parts you make can. Leave out sheet for catalog parts, stand-ins and supplies.`,
  );
}

export function sheetEntry(p: ScenePart, measured: PartBoxes[string]) {
  const material = sheetOf(p);

  if (!material) return {};

  if (!measured) return { sheet: { material } };

  if (!measured.sheet) return { sheet: { material, flat: false } };

  return { sheet: { material, mm: sheetThickness(material, measured) } };
}

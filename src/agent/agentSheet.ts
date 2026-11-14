import type { ScenePart } from '../types/robotics';
import type { SheetMaterial } from '../types/print';
import { dimensionFit, printedPatch, sheetPatch } from '../sheet/sheetPatch';
import { sheetPart } from '../utils/bom';

export interface AgentSheet {
  material: SheetMaterial;
  thickness?: number;
}

export const isResizable = (part: ScenePart) =>
  part.kind !== 'cad_part' && part.kind !== 'component' && part.kind !== 'hardware';

export function sheetFields(part: ScenePart, sheet: AgentSheet | null): Partial<ScenePart> {
  if (!sheet) return printedPatch(part);

  const fit = isResizable(part) ? dimensionFit(part.dimensions) : null;

  return sheetPatch(part, { material: sheet.material, thicknessMm: sheet.thickness }, fit);
}

export function sheetEntry(p: ScenePart) {
  const sheet = sheetPart(p);

  return sheet ? { sheet: { material: sheet.material, thickness: sheet.thicknessMm } } : {};
}

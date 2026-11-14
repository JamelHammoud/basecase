import { plateThickness, sheetOf, snapThickness } from '../sheet/sheetStock';
import type { ScenePart } from '../types/robotics';
import type { SheetMaterial } from '../types/print';

export interface AgentSheet {
  material: SheetMaterial;
  thickness?: number;
}

const PRINTED_TAG = '3D Printed PLA/PETG';

export function sheetPatch(part: ScenePart, sheet: AgentSheet | null): Pick<ScenePart, 'sheet' | 'mechanicalTag'> {
  if (!sheet) return { sheet: undefined, mechanicalTag: sheetOf(part) ? PRINTED_TAG : part.mechanicalTag };

  return {
    sheet: {
      material: sheet.material,
      thickness: snapThickness(sheet.material, sheet.thickness ?? plateThickness(part)),
    },
    mechanicalTag: part.mechanicalTag,
  };
}

export function sheetEntry(p: ScenePart): { sheet?: string } {
  const sheet = sheetOf(p);

  return sheet ? { sheet: `${sheet.material}:${sheet.thickness}` } : {};
}

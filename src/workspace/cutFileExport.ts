import type { ScenePart } from '../types/robotics';
import type { MeshMeasure } from '../three/meshMeasure';
import type { SheetProfile } from '../types/sheet';
import { sheetOf } from '../sheet/materials';

export interface CutFileItem {
  part: Pick<ScenePart, 'id' | 'name' | 'dimensions' | 'sheet' | 'mechanicalTag' | 'role'>;
  profile: SheetProfile;
}

export const isSheetSolid = (part: ScenePart) => part.role === 'solid' && !!sheetOf(part);

export async function cutFileJob(
  parts: ScenePart[],
  measure: (ids: string[]) => Promise<Record<string, MeshMeasure>>,
): Promise<CutFileItem[]> {
  const sheets = parts.filter(isSheetSolid);

  if (!sheets.length) return [];

  const measured = await measure(sheets.map((part) => part.id));

  return sheets.map((part) => {
    const profile = measured[part.id]?.sheet;

    if (!profile) throw new Error(`${part.name}: use a flat part with through holes for Cut Files.`);

    const { id, name, dimensions, sheet, mechanicalTag, role } = part;

    return { part: { id, name, dimensions, sheet, mechanicalTag, role }, profile };
  });
}

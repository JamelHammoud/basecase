import type { Viewport3DHandle } from '../components/Viewport3D';
import { isSheetMaterial, partSheet, sheetFor } from '../sheet/materials';
import type { ScenePart } from '../types/robotics';

interface SheetUpdate {
  patch: Partial<ScenePart>;
  problem?: string;
}

const printedAgain = (part: ScenePart): Partial<ScenePart> => ({
  sheet: undefined,
  mechanicalTag: partSheet({ mechanicalTag: part.mechanicalTag }) ? undefined : part.mechanicalTag,
});

export async function sheetUpdate(
  part: ScenePart,
  material: unknown,
  viewport: Viewport3DHandle | null,
): Promise<SheetUpdate> {
  if (material === undefined) return { patch: {} };

  if (material === null) return { patch: printedAgain(part) };

  if (!isSheetMaterial(material)) return { patch: {}, problem: `${part.id}: sheet is aluminum, carbon or acrylic` };

  const profile = (await viewport?.sheetProfiles([part.id]))?.[part.id];

  if (!profile)
    return {
      patch: {},
      problem: `${part.id} isn't a flat plate (two parallel faces with only through-cuts between them), so it can't be cut from sheet`,
    };

  return { patch: { sheet: sheetFor(material, profile.thicknessMm), mechanicalTag: undefined } };
}

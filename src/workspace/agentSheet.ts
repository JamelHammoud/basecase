import type { AgentPartSpec } from '../agent/agentScene';
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

const RESHAPING = ['size', 'thickness', 'edges', 'cad'] as const;

export async function sheetUpdate(
  part: ScenePart,
  spec: Pick<AgentPartSpec, 'sheet' | (typeof RESHAPING)[number]>,
  viewport: Viewport3DHandle | null,
): Promise<SheetUpdate> {
  const material: unknown = spec.sheet;

  if (material === undefined) return { patch: {} };

  if (material === null) return { patch: printedAgain(part) };

  if (!isSheetMaterial(material)) return { patch: {}, problem: `${part.id}: sheet is aluminum, carbon or acrylic` };

  const reshaped = RESHAPING.filter((key) => spec[key] !== undefined);

  if (reshaped.length)
    return {
      patch: {},
      problem: `${part.id}: sheet wasn't set, because ${reshaped.join(' and ')} changed its shape in the same update and the thickness is measured on the shape before it. Send sheet again in its own update_parts call.`,
    };

  const profile = (await viewport?.sheetProfiles([part.id]))?.[part.id];

  if (!profile)
    return {
      patch: {},
      problem: `${part.id} isn't a flat plate (two parallel faces with only through-cuts between them), so it can't be cut from sheet`,
    };

  return { patch: { sheet: sheetFor(material, profile.thicknessMm), mechanicalTag: undefined } };
}

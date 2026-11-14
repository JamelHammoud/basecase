import type { ScenePart } from '../types/robotics';
import type { PartSheet, SheetProfile } from '../types/sheet';
import { applySheet, sheetOf } from '../sheet/materials';
import type { AgentPartSpec } from './agentScene';
import { geometryWorker } from '../three/geometryWorker';

const LEGACY_SHEET = { aluminum: 'aluminum-6061', laser_cut: 'carbon-fiber' } as const;

function checkedSheet(value: unknown): PartSheet {
  if (!value || typeof value !== 'object') throw new Error('Choose a sheet material and thickness.');

  const { material, thicknessMm } = value as Partial<PartSheet>;

  if (material !== 'aluminum-6061' && material !== 'carbon-fiber' && material !== 'acrylic') {
    throw new Error('Choose aluminum-6061, carbon-fiber or acrylic for the sheet material.');
  }

  if (typeof thicknessMm !== 'number' || !Number.isFinite(thicknessMm) || thicknessMm <= 0) {
    throw new Error('Choose a positive sheet thickness.');
  }

  return { material, thicknessMm };
}

export const requestsSheet = (spec: AgentPartSpec) =>
  spec.sheet !== undefined || spec.material === 'aluminum' || spec.material === 'laser_cut';

export function sheetSpec(part: ScenePart, spec: AgentPartSpec): AgentPartSpec {
  const geometryChanged = !!(spec.size || spec.cad);

  return geometryChanged && part.sheet && !spec.material && spec.sheet === undefined
    ? { ...spec, sheet: part.sheet }
    : spec;
}

export async function incomingSheetProfile(spec: AgentPartSpec): Promise<SheetProfile | undefined> {
  if (!spec.cad || !requestsSheet(spec)) return undefined;

  const { positions, indices } = spec.cad;
  const payload = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };

  return geometryWorker.call('sheetProfile', payload, [payload.positions.buffer, payload.indices.buffer]);
}

export function applyAgentSheet(part: ScenePart, spec: AgentPartSpec, profile?: SheetProfile): ScenePart {
  if (spec.cad && spec.sheet === undefined && !spec.material && !profile && sheetOf(part)) {
    return { ...part, sheet: undefined, mechanicalTag: '3D Printed PLA/PETG', printMaterial: undefined };
  }

  const setting = sheetSpec(part, spec);

  if (setting.sheet !== undefined) return applySheet(part, checkedSheet(setting.sheet), profile);

  if (spec.material === 'aluminum' || spec.material === 'laser_cut') {
    const thicknessMm =
      profile?.thicknessMm ?? Math.min(part.dimensions.width, part.dimensions.height, part.dimensions.depth);

    return applySheet(part, { material: LEGACY_SHEET[spec.material], thicknessMm }, profile);
  }

  if (spec.material && part.sheet) return { ...part, sheet: undefined };

  return part;
}

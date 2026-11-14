import { applySpec, specToPart, type AgentPartSpec } from './agentScene';
import { requestsSheet } from './agentSheet';
import type { ScenePart } from '../types/robotics';
import type { SheetProfile } from '../types/sheet';
import { geometryWorker } from '../three/geometryWorker';
import type { AgentOpsContext } from '../workspace/applyAgentOps';

export async function incomingSheetProfile(spec: AgentPartSpec): Promise<SheetProfile | undefined> {
  if (!requestsSheet(spec)) return undefined;

  if (!spec.cad) {
    const part = specToPart({ ...spec, sheet: undefined, material: 'printed' });

    return geometryWorker.call('partSheetProfile', part);
  }

  const { positions, indices } = spec.cad;
  const payload = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };

  return geometryWorker.call('sheetProfile', payload, [payload.positions.buffer, payload.indices.buffer]);
}

export async function updatedSheetProfile(part: ScenePart, spec: AgentPartSpec): Promise<SheetProfile | undefined> {
  if (spec.cad) return incomingSheetProfile(spec);

  const candidate = applySpec(part, { ...spec, sheet: undefined, material: 'printed' });

  return geometryWorker.call('partSheetProfile', candidate);
}

export async function profileForUpdate(part: ScenePart, spec: AgentPartSpec, ctx: AgentOpsContext) {
  if (!requestsSheet(spec)) return undefined;

  if (spec.size || spec.cad || spec.edges !== undefined || spec.thickness !== undefined) {
    return updatedSheetProfile(part, spec);
  }

  const viewport = ctx.viewport();

  await viewport?.meshesReady();

  return (await viewport?.measureParts([part.id]))?.[part.id]?.sheet;
}

import type { ScenePart, CustomModelDefinition } from '../../types/robotics';
import { surfaceOperands } from '../../booleans/operands';

type Container = Pick<ScenePart, 'dimensionBindings' | 'boolean' | 'customNodes'>;

function boundRecords(records: Container[]): boolean {
  const pending = [...records];
  const seen = new Set<Container>();

  while (pending.length) {
    const record = pending.pop()!;

    if (seen.has(record)) continue;

    seen.add(record);

    if (record.dimensionBindings?.length) return true;

    pending.push(...(record.boolean?.operands ?? []));
    pending.push(...(record.customNodes ?? []).flatMap((node) => (node.part ? [node.part] : [])));
  }

  return false;
}

export const hasParameterBindings = (parts: ScenePart[]) => boundRecords(parts);
export const hasEmbeddedParameterBindings = (parts: ScenePart[]) =>
  boundRecords(
    surfaceOperands(parts).flatMap((part) =>
      (part.customNodes ?? []).flatMap((node) => (node.part ? [node.part] : [])),
    ),
  );

export function refuseParameterTransfer(parts: ScenePart[]) {
  if (hasParameterBindings(parts))
    throw new Error('Unbind shared dimensions before saving to Library or inserting into another scene.');
}

export function refuseParameterModel(model: CustomModelDefinition) {
  if (boundRecords(model.nodes.flatMap((node) => (node.part ? [node.part] : []))))
    throw new Error('Unbind shared dimensions before saving to Library or inserting into another scene.');
}

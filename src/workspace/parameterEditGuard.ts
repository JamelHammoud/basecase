import type { ScenePart, ProjectSettings } from '../types/robotics';
import { validateParameterRecords } from '../utils/designParameters/verification';
import { errorMessage } from '../utils/errorMessage';
import { surfaceOperands } from '../booleans/operands';

function assertBoundScale(parts: ScenePart[], before: ScenePart[]) {
  const bound = surfaceOperands(parts).filter((part) =>
    part.dimensionBindings?.some((binding) => binding.kind !== 'primitive'),
  );

  if (!bound.length) return;

  const originals = new Map(surfaceOperands(before).map((part) => [part.id, part]));

  for (const part of bound) {
    const original = originals.get(part.id);

    if (!original || part.cad !== original.cad || part.sketch !== original.sketch) continue;

    if ((['width', 'height', 'depth'] as const).some((axis) => part.dimensions[axis] !== original.dimensions[axis]))
      throw new Error('Edit the shared parameter or unbind this dimension.');
  }
}

export function permittedParameterEdit(
  parts: ScenePart[],
  project: ProjectSettings,
  refused?: (reason: string) => void,
  before: ScenePart[] = parts,
) {
  try {
    assertBoundScale(parts, before);
    validateParameterRecords(parts, project.designParameters);

    return true;
  } catch (error) {
    refused?.(errorMessage(error));

    return false;
  }
}

import { surfaceOperands } from '../../booleans/operands';
import type { ParameterDesign } from './mutations';

export function tolerancePayload(design: ParameterDesign): ParameterDesign {
  return {
    parameters: design.parameters,
    requirements: design.requirements,
    parts: surfaceOperands(design.parts)
      .filter((part) => part.dimensionBindings?.length)
      .map((part) => ({
        id: part.id,
        name: part.name,
        kind: part.kind,
        category: part.category,
        role: part.role,
        position: part.position,
        rotation: part.rotation,
        dimensions: part.dimensions,
        color: part.color,
        visible: part.visible,
        locked: part.locked,
        note: '',
        dimensionBindings: part.dimensionBindings,
        ...(part.cad ? { cad: { ...part.cad, positions: [], indices: [], edges: undefined } } : {}),
        ...(part.sketch ? { sketch: part.sketch } : {}),
      })),
  };
}

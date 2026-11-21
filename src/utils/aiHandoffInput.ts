import type { ScenePart } from '../types/robotics';

const inputs = new WeakMap<ScenePart, ScenePart>();

export function handoffPart(part: ScenePart): ScenePart {
  const saved = inputs.get(part);

  if (saved) return saved;

  const input: ScenePart = {
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
    note: part.note,
    mechanicalTag: part.mechanicalTag,
    printMaterial: part.printMaterial,
    componentId: part.componentId,
    hardware: part.hardware,
    cad: part.cad
      ? {
          language: part.cad.language,
          code: part.cad.code,
          positions: [],
          indices: [],
          originOffset: part.cad.originOffset,
          baseSize: part.cad.baseSize,
        }
      : undefined,
  };

  inputs.set(part, input);

  return input;
}

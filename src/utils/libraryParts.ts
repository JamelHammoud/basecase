import { CustomModelDefinition, ScenePart } from '../types/robotics';

/** Models saved from a scene keep every part whole (or, in older saves, at least its box) */
export const isSceneModel = (model: CustomModelDefinition) =>
  model.nodes.length > 0 &&
  model.nodes.every((n) => n.part || (model.sourceType === 'scene-selection' && n.nodeType === 'primitive'));

/**
 * The scene parts a library model becomes, centered on `base`. Models saved from a scene come
 * back as their real parts (grouped under the model's name when there are several); anything
 * else is one `custom_model` part. `missingShapes` counts older CAD parts saved only as boxes.
 */
export function modelToParts(
  model: CustomModelDefinition,
  base: [number, number, number],
  makeId: (prefix?: string) => string
): { parts: ScenePart[]; missingShapes: number } {
  if (!isSceneModel(model)) {
    return {
      missingShapes: 0,
      parts: [
        {
          id: makeId(),
          name: model.name,
          kind: 'custom_model',
          category: 'custom_models',
          role: 'solid',
          position: base,
          rotation: [0, 0, 0],
          dimensions: { ...model.defaultDimensions },
          color: model.defaultColor,
          note: model.description || '',
          mechanicalTag: model.mechanicalTag || '3D Printed PLA/PETG',
          visible: true,
          locked: false,
          customModelId: model.id,
          customNodes: model.nodes,
          sourceImageDataUrl: model.sourceImageDataUrl,
        },
      ],
    };
  }

  const group = model.nodes.length > 1 ? { group: { id: makeId('group'), name: model.name } } : {};
  let missingShapes = 0;
  const parts = model.nodes.map((n): ScenePart => {
    const position: [number, number, number] = [
      Math.round((base[0] + n.position[0]) * 10) / 10,
      Math.round((base[1] + n.position[1]) * 10) / 10,
      Math.round((base[2] + n.position[2]) * 10) / 10,
    ];
    if (n.part) return { ...n.part, id: makeId(), position, ...group };
    // Older saves kept only the box of each part; CAD parts lost their shape
    const kind = n.primitiveKind && n.primitiveKind !== 'cad_part' ? n.primitiveKind : 'box';
    if (n.primitiveKind === 'cad_part') missingShapes++;
    return {
      id: makeId(),
      name: n.name,
      kind,
      category: 'primitives',
      role: n.role,
      position,
      rotation: [...n.rotation],
      dimensions: { ...n.dimensions },
      color: n.color,
      note: '',
      mechanicalTag: model.mechanicalTag || '3D Printed PLA/PETG',
      visible: true,
      locked: false,
      deformers: n.deformers,
      ...group,
    };
  });
  return { parts, missingShapes };
}

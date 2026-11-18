import type { CustomModelDefinition, RobotJoint, ScenePart } from '../types/robotics';
import { placedJoints } from './libraryJoints';
import { refuseParameterModel } from './designParameters/transfers';

const APP_WRITTEN =
  /^(Saved from (scene \([\w-]+\)|\d+ parts?)|3D model generated via ACP from reference image \(.*\))\.?$/;

export const modelNote = (model: CustomModelDefinition) =>
  APP_WRITTEN.test(model.description) ? '' : model.description || '';

export const isSceneModel = (model: CustomModelDefinition) =>
  model.nodes.length > 0 &&
  model.nodes.every((n) => n.part || (model.sourceType === 'scene-selection' && n.nodeType === 'primitive'));

export function modelToParts(
  model: CustomModelDefinition,
  base: [number, number, number],
  makeId: (prefix?: string) => string,
): { parts: ScenePart[]; joints: RobotJoint[]; missingShapes: number } {
  refuseParameterModel(model);

  if (!isSceneModel(model)) {
    return {
      missingShapes: 0,
      joints: [],
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
          note: modelNote(model),
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
  const ids = new Map<string, string>();
  const parts = model.nodes.map((n): ScenePart => {
    const id = makeId();

    ids.set(n.id, id);

    const position: [number, number, number] = [
      base[0] + n.position[0],
      base[1] + n.position[1],
      base[2] + n.position[2],
    ];

    if (n.part)
      return {
        ...structuredClone(n.part),
        id,
        position,
        rotation: [...n.rotation],
        dimensions: { ...n.dimensions },
        ...group,
      };

    const kind = n.primitiveKind && n.primitiveKind !== 'cad_part' ? n.primitiveKind : 'box';

    if (n.primitiveKind === 'cad_part') missingShapes++;

    return {
      id,
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

  return { parts, joints: placedJoints(model.joints ?? [], ids, base, makeId), missingShapes };
}

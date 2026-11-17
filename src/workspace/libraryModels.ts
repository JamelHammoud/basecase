import type { CustomModelDefinition, CustomModelSubNode, RobotJoint, ScenePart } from '../types/robotics';
import { capturedJoints } from '../utils/libraryJoints';
import { modelId, stamp } from './helpers';
import { halfExtents } from '../utils/selection';
import { PRINTED_TAG } from './partFactories';

const MIN_MODEL_SIDE = 4;

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

export function partsBox(parts: ScenePart[]): Box {
  const box: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (const p of parts) {
    const half = halfExtents(p);

    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i], p.position[i] - half[i]);
      box.max[i] = Math.max(box.max[i], p.position[i] + half[i]);
    }
  }

  return box;
}

const nodePart = ({ id: _id, position: _position, group: _group, ...part }: ScenePart) => part;

function asSaved(part: ScenePart): ScenePart {
  return part.kind === 'boolean' ? { ...part, kind: 'mesh', boolean: undefined } : part;
}

function modelNode(source: ScenePart, center: number[]): CustomModelSubNode {
  const p = asSaved(structuredClone(source));

  return {
    id: `node-${p.id}`,
    name: p.name,
    nodeType: 'primitive',
    primitiveKind: p.kind === 'custom_model' || p.kind === 'sculpt_mesh' ? 'box' : p.kind,
    role: p.role,
    position: [p.position[0] - center[0], p.position[1] - center[1], p.position[2] - center[2]],
    rotation: [...p.rotation],
    dimensions: { ...p.dimensions },
    color: p.color,
    deformers: p.deformers,
    part: nodePart(p),
  };
}

export interface SceneModelInput {
  sourceParts: ScenePart[];
  joints?: RobotJoint[];
  single: ScenePart | null;
  sceneName: string;
  screenshot: () => Promise<string> | undefined;
}

export async function sceneModel({
  sourceParts,
  joints,
  single,
  sceneName,
  screenshot,
}: SceneModelInput): Promise<CustomModelDefinition> {
  const { min, max } = partsBox(sourceParts);
  const center = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const side = (i: number) => Math.max(MIN_MODEL_SIDE, Math.round(max[i] - min[i]));

  return {
    id: modelId(),
    name: single ? single.name : sceneName,
    description: single?.note ?? '',
    createdAt: stamp(),
    sourceType: 'scene-selection',
    sourceImageDataUrl: single ? single.sourceImageDataUrl : await screenshot(),
    defaultDimensions: { width: side(0), height: side(1), depth: side(2), thickness: 4 },
    defaultColor: sourceParts[0].color,
    mechanicalTag: sourceParts[0].mechanicalTag || PRINTED_TAG,
    nodes: sourceParts.map((p) => modelNode(p, center)),
    ...(joints ? { joints: capturedJoints(joints, sourceParts, center) } : {}),
  };
}

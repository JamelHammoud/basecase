import type { CustomModelDefinition, CustomModelSubNode, ScenePart } from '../types/robotics';
import { modelId, stamp } from './helpers';
import { PRINTED_TAG } from './partFactories';

const round1 = (v: number) => Math.round(v * 10) / 10;
const MIN_MODEL_SIDE = 4;

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

export function partsBox(parts: ScenePart[]): Box {
  const box: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (const p of parts) {
    const half = [p.dimensions.width / 2, p.dimensions.height / 2, p.dimensions.depth / 2];

    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i], p.position[i] - half[i]);
      box.max[i] = Math.max(box.max[i], p.position[i] + half[i]);
    }
  }

  return box;
}

const nodePart = ({ id: _id, position: _position, group: _group, ...part }: ScenePart) => part;

function modelNode(p: ScenePart, center: number[]): CustomModelSubNode {
  return {
    id: `node-${p.id}`,
    name: p.name,
    nodeType: 'primitive',
    primitiveKind: p.kind === 'custom_model' || p.kind === 'sculpt_mesh' ? 'box' : p.kind,
    role: p.role,
    position: [round1(p.position[0] - center[0]), round1(p.position[1] - center[1]), round1(p.position[2] - center[2])],
    rotation: [...p.rotation],
    dimensions: { ...p.dimensions },
    color: p.color,
    deformers: p.deformers,
    part: nodePart(p),
  };
}

export interface SceneModelInput {
  sourceParts: ScenePart[];
  single: ScenePart | null;
  sceneName: string;
  screenshot: () => string | undefined;
}

export function sceneModel({ sourceParts, single, sceneName, screenshot }: SceneModelInput): CustomModelDefinition {
  const { min, max } = partsBox(sourceParts);
  const center = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  const side = (i: number) => Math.max(MIN_MODEL_SIDE, Math.round(max[i] - min[i]));

  return {
    id: modelId(),
    name: single ? single.name : sceneName,
    description: single ? single.note || `Saved from scene (${single.kind})` : `Saved from ${sourceParts.length} parts`,
    createdAt: stamp(),
    sourceType: 'scene-selection',
    sourceImageDataUrl: single ? single.sourceImageDataUrl : screenshot(),
    defaultDimensions: { width: side(0), height: side(1), depth: side(2), thickness: 4 },
    defaultColor: sourceParts[0].color,
    mechanicalTag: sourceParts[0].mechanicalTag || PRINTED_TAG,
    nodes: sourceParts.map((p) => modelNode(p, center)),
  };
}

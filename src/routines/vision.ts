import type { VisionResult } from '../vision/types';
import type { Plan } from './planTypes';
import type { RoutineError } from './schema';
import { findNode } from './nodes';
import type { DataType } from './schema';
import type { FactValue } from './traceDecode';

export const ROUTINE_VISION_MODELS: Readonly<Record<string, string>> = {
  'person-detection': 'yolo11n',
  'object-detection': 'rfdetr-nano',
  'obstacle-near': 'depth-anything-v2-small',
  'face-detection': 'yunet',
  pose: 'mediapipe-pose',
};

export interface VisionFactRequest {
  model: string;
  type: DataType | 'audio';
  label?: string;
}

export function routineVisionModel(plan: Plan, node: string, camera?: string) {
  return (
    plan.visionModels?.find((binding) => binding.node === node && binding.camera === camera)?.modelId ??
    ROUTINE_VISION_MODELS[node] ??
    node
  );
}

export function routineVisionModels(plan: Plan): string[] {
  const nodes = [...plan.watchers, ...plan.ops.filter((op) => op.kind === 'infer')];

  return [
    ...new Set(
      nodes.flatMap((node) => {
        const model = node.model ?? '';

        if (!findNode(model)?.inputs.includes('image')) return [];

        const bound = plan.visionModels?.filter((binding) => binding.node === model);

        return bound?.length ? bound.map((binding) => binding.modelId) : [ROUTINE_VISION_MODELS[model] ?? model];
      }),
    ),
  ];
}

function nearness(result: VisionResult): number {
  const depth = result.depth;

  if (!depth) throw new Error('The depth model did not return a depth image.');

  if (depth.nearness === undefined || !Number.isFinite(depth.nearness)) {
    throw new Error('The depth model did not return image-relative nearness.');
  }

  return depth.nearness;
}

export function visionFact(result: VisionResult, request: VisionFactRequest): FactValue {
  if (request.model === 'obstacle-near') {
    const value = nearness(result);

    return { num: request.type === 'boolean' ? Number(value >= 0.75) : value, name: null };
  }

  if (request.model === 'pose') {
    return {
      num: result.detections.reduce((count, detection) => count + (detection.keypoints?.length ?? 0), 0),
      name: null,
    };
  }

  const label = request.label ?? (request.model === 'person-detection' ? 'person' : undefined);
  const classification = result.classes?.[0];
  const observations = classification && classification.score >= 0.5 ? [classification] : result.detections;
  const detections = observations.filter((detection) => label === undefined || detection.label === label);

  return { num: request.type === 'boolean' ? Number(detections.length > 0) : detections.length, name: null };
}

export function routineVisionErrors(plan: Plan, unavailable: readonly string[]): RoutineError[] {
  const nodes = [...plan.watchers, ...plan.ops.filter((op) => op.kind === 'infer')];

  return nodes.flatMap((node) => {
    const model = node.model ?? '';

    const models =
      plan.visionModels?.filter((binding) => binding.node === model).map((binding) => binding.modelId) ?? [];

    if (![ROUTINE_VISION_MODELS[model] ?? model, ...models].some((id) => unavailable.includes(id))) return [];

    const path = 'id' in node ? node.id : node.node;
    const label = findNode(model)?.label ?? model;

    return [{ code: 'model-unavailable', path, message: `${label} couldn’t load for ${path}. Run it again.` }];
  });
}

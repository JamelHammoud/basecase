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

export function routineModelUnavailable(model: string, unavailable: readonly string[]): boolean {
  return unavailable.includes(model) || unavailable.includes(ROUTINE_VISION_MODELS[model] ?? model);
}

export function routineVisionModels(plan: Plan): string[] {
  const models = [
    ...plan.watchers.map((w) => w.model),
    ...plan.ops.flatMap((op) => (op.kind === 'infer' && op.model ? [op.model] : [])),
  ];

  return [
    ...new Set(
      models.flatMap((model) =>
        findNode(model)?.inputs.includes('image') ? [ROUTINE_VISION_MODELS[model] ?? model] : [],
      ),
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
  const detections = result.detections.filter((detection) => label === undefined || detection.label === label);

  return { num: request.type === 'boolean' ? Number(detections.length > 0) : detections.length, name: null };
}

export function routineVisionErrors(plan: Plan, unavailable: readonly string[]): RoutineError[] {
  const nodes = [...plan.watchers, ...plan.ops.filter((op) => op.kind === 'infer')];

  return nodes.flatMap((node) => {
    const model = node.model ?? '';

    if (!routineModelUnavailable(model, unavailable)) return [];

    const path = 'id' in node ? node.id : node.node;
    const label = findNode(model)?.label ?? model;

    return [{ code: 'model-unavailable', path, message: `${label} couldn’t load for ${path}. Run it again.` }];
  });
}

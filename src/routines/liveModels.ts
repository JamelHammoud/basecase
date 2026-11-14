import { findNode } from './nodes';
import type { Plan } from './planTypes';
import { VISION_MODELS } from './routineVision';
import type { RoutineError } from './schema';

export function liveModelErrors(plan: Plan): RoutineError[] {
  const nodes = [...plan.watchers, ...plan.ops];

  return nodes.flatMap((node) => {
    const model = node.model ? findNode(node.model) : undefined;

    if (!model || model.tier !== 'perception' || VISION_MODELS.has(model.id)) return [];

    return [
      {
        code: 'missing-model',
        message: `${model.label} needs ${model.model} to run.`,
        path: 'node' in node ? node.node : node.id,
      },
    ];
  });
}

export class RoutineModelError extends Error {
  readonly errors: RoutineError[];

  constructor(errors: RoutineError[]) {
    super(errors[0]?.message ?? 'The camera model didn’t load.');
    this.errors = errors;
  }
}

export function modelLoadErrors(plan: Plan, modelId: string, reason: unknown): RoutineError[] {
  const model = findNode(modelId);
  const detail = reason instanceof Error ? reason.message : String(reason);
  const message = `${model?.label ?? modelId} couldn’t load ${model?.model ?? modelId}. ${detail}`;

  return [...plan.watchers, ...plan.ops]
    .filter((node) => node.model === modelId)
    .map((node) => ({ code: 'missing-model', message, path: 'node' in node ? node.node : node.id }));
}

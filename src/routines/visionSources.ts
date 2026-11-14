import type { Plan } from './planTypes';
import { VISION_MODELS } from './routineVision';

export const planVisionSources = (plan: Plan, defaultCamera = 'scene') => {
  const nodes = [...plan.watchers, ...plan.ops];
  const sources = nodes
    .filter((node) => node.model && VISION_MODELS.has(node.model))
    .map((node) => ({ camera: node.camera ?? defaultCamera, model: node.model! }));

  return [...new Map(sources.map((source) => [`${source.camera}:${source.model}`, source])).values()];
};

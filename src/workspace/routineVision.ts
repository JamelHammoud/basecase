import { acquireVisionCamera, ensureVisionModel } from '../cameras/visionSession';
import { operatorPoseReady } from '../cameras/operator/operatorCamera';
import type { Plan } from '../routines/planTypes';
import type { RoutineError } from '../routines/schema';
import { ROUTINE_VISION_MODELS, routineVisionErrors, routineVisionModels } from '../routines/vision';

export interface PreparedRoutineVision {
  errors: RoutineError[];
  release: () => void;
}

const rateFor = (plan: Plan, modelId: string) => {
  const watchers = plan.watchers.filter((watcher) => ROUTINE_VISION_MODELS[watcher.model] === modelId);

  return watchers.length ? Math.max(...watchers.map((watcher) => watcher.rateHz)) : 5;
};

export async function prepareRoutineVision(
  plan: Plan,
  cameras: string[],
  options: {
    rendered?: boolean;
    current?: () => boolean;
    vision?: { acquireVisionCamera: typeof acquireVisionCamera };
  } = {},
): Promise<PreparedRoutineVision> {
  const models = routineVisionModels(plan);

  if (options.rendered) return prepareRenderedVision(plan, models, cameras);

  const prepared: Array<() => void> = [];
  const unavailable = new Set<string>(cameras.length ? [] : models);
  const jobs = cameras.flatMap((camera) =>
    models.filter((modelId) => modelId !== 'mediapipe-pose').map((modelId) => ({ camera, modelId })),
  );

  await loadModels(
    models.filter((model) => model !== 'mediapipe-pose'),
    unavailable,
  );

  if (models.includes('mediapipe-pose') && (!cameras.includes('operator') || !operatorPoseReady()))
    unavailable.add('mediapipe-pose');

  if (unavailable.size || (options.current && !options.current()))
    return { errors: routineVisionErrors(plan, [...unavailable]), release: () => undefined };

  await Promise.all(
    jobs.map(async ({ camera, modelId }) => {
      try {
        const release = await (options.vision?.acquireVisionCamera ?? acquireVisionCamera)(camera, {
          modelId,
          fps: rateFor(plan, modelId),
          current: options.current ?? (() => true),
        });

        prepared.push(release);
      } catch {
        unavailable.add(modelId);
      }
    }),
  );

  const release = () => {
    for (const stop of prepared.splice(0)) stop();
  };
  const errors = routineVisionErrors(plan, [...unavailable]);

  if (errors.length) release();

  return { errors, release };
}

async function prepareRenderedVision(plan: Plan, models: string[], cameras: string[]): Promise<PreparedRoutineVision> {
  const unavailable = new Set<string>(cameras.length ? [] : models);

  await loadModels(models, unavailable);

  return { errors: routineVisionErrors(plan, [...unavailable]), release: () => undefined };
}

async function loadModels(models: string[], unavailable: Set<string>) {
  await Promise.all(
    models.map(async (model) => {
      try {
        await ensureVisionModel(model);
      } catch {
        unavailable.add(model);
      }
    }),
  );
}

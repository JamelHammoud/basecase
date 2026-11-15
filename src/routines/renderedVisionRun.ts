import { loadCameraStage, renderCameraFrame } from '../cameras/cameraStage';
import type { VisionResult } from '../vision/types';
import type { RenderedVisionRequest } from './renderedVisionProtocol';
import { runScenario } from './scenario';
import { visionInferencePort } from './visionInferencePort';

export async function runRenderedVisionJob(request: RenderedVisionRequest, progress: () => void) {
  const inference = visionInferencePort(request.port);

  try {
    if (request.scenario.tier !== 'L2') throw new Error('Rendered vision needs an L2 scenario.');

    if (!request.stage.views.length) throw new Error('L2 needs a camera view.');

    if (!(await loadCameraStage(request.stage))) throw new Error('The L2 camera scene could not load.');

    progress();

    return await runScenario(request.plan, request.scenario, {
      sample: async (modelId, timestamp) => {
        const results: VisionResult[] = [];

        for (const view of request.stage.views) {
          const frames = await renderCameraFrame({ poses: null, keys: [view.key], timestamp });
          const frame = frames[view.key];

          if (!frame) throw new Error(`The L2 camera ${view.key} could not render.`);

          try {
            const result = await inference.infer({
              frame,
              modelId,
              camera: `${request.cameraPrefix}${view.key}`,
              timestamp,
            });

            results.push({ ...result, camera: view.key });
            progress();
          } finally {
            frame.close();
          }
        }

        return results;
      },
    });
  } finally {
    inference.close();
  }
}

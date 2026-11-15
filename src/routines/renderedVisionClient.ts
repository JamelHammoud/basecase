import type { CameraStageJob } from '../cameras/cameraStage';
import { connectVisionFrames } from '../cameras/visionSession';
import type { Plan } from './planTypes';
import type { RenderedVisionRequest, RenderedVisionResponse } from './renderedVisionProtocol';
import type { Scenario, ScenarioResult } from './scenarioTypes';

export async function runRenderedVisionScenario(
  plan: Plan,
  scenario: Scenario,
  stage: CameraStageJob,
): Promise<ScenarioResult> {
  if (scenario.tier !== 'L2') throw new Error('Rendered vision needs an L2 scenario.');

  const port = await connectVisionFrames();
  let worker: Worker;

  try {
    worker = new Worker(new URL('./renderedVision.worker.ts', import.meta.url), { type: 'module' });
  } catch (error) {
    port.close();

    throw error;
  }

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      port.close();
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const wake = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fail(new Error('The L2 camera worker timed out.')), 45000);
    };

    worker.onmessage = ({ data }: MessageEvent<RenderedVisionResponse>) => {
      if (data.type === 'progress') return wake();

      cleanup();

      if (data.type === 'error') reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = (event) => fail(new Error(event.message || 'The L2 camera worker stopped.'));
    worker.onmessageerror = () => fail(new Error('The L2 camera worker response could not be decoded.'));
    wake();

    try {
      worker.postMessage(
        {
          plan,
          scenario,
          stage,
          port,
          cameraPrefix: `routine-l2:${crypto.randomUUID()}:`,
        } satisfies RenderedVisionRequest,
        [port],
      );
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

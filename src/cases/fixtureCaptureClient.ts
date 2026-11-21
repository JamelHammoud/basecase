import type { CaseSpec } from './caseBuilder';
import type { BuilderRobot } from './caseGoals';
import { workerClient } from '../utils/workerRpc';
import type { fixtureCaptureHandlers, FixtureCaptureJob } from './fixtureCaptureHandlers';

const worker = workerClient<typeof fixtureCaptureHandlers>(
  () => new Worker(new URL('./fixtureCapture.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./fixtureCaptureHandlers')).fixtureCaptureHandlers,
);

export async function captureFixtureInWorker(job: FixtureCaptureJob, screenshot: () => Promise<string> | undefined) {
  const [model, sourceImageDataUrl] = await Promise.all([worker.call('capture', job), screenshot()]);

  return { ...model, sourceImageDataUrl };
}

export const prepareFixtureCase = (spec: CaseSpec, robot: BuilderRobot) => worker.call('build', { spec, robot });

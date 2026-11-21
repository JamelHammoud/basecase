import type { BodyRecordingRequest } from './bodyRecordingRun';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotRun } from '../robot/runBuffer';
import { workerClient } from '../utils/workerRpc';
import type { BodyCalibration } from './bodyTypes';
import type { measuredBodyAnalysis, BodyAnalysisMetrics } from './bodyAnalysisMetrics';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';

export interface BodyFitRequest {
  model: SimModel;
  run: RobotRun;
  robot: string;
}

type BodyHandlers = {
  readRecording: (request: BodyRecordingRequest) => Promise<{ result: RobotRun | null }>;
  analyze: (request: BodyAnalysisRequest) => Promise<{ result: Awaited<ReturnType<typeof measuredBodyAnalysis>> }>;
  fit: (request: BodyFitRequest) => Promise<{ result: BodyCalibration }>;
};

let latest: BodyAnalysisMetrics | null = null;
let cancellationMs = 0;
let submissionMs = 0;

export const bodyAnalysisMetrics = () => ({ analysis: latest, cancellationMs, submissionMs });

export function bodyClient() {
  const client = workerClient<BodyHandlers>(
    () => new Worker(new URL('./body.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof window !== 'undefined') throw new Error('Reload the app before fitting its body.');

      return {
        fit: async (request) => {
          const { fitBody } = await import('./fitBody');

          return { result: await fitBody(request) };
        },
        readRecording: async (request) => {
          const { readBodyRecording } = await import('./bodyRecordingRun');

          return { result: readBodyRecording(request) };
        },
        analyze: async (request) => {
          const { measuredBodyAnalysis } = await import('./bodyAnalysisMetrics');

          return { result: await measuredBodyAnalysis(request) };
        },
      };
    },
  );

  return {
    readRecording: (request: BodyRecordingRequest) => client.call('readRecording', request),
    analyze: async (request: BodyAnalysisRequest) => {
      const started = performance.now();
      const pending = client.call('analyze', request);

      submissionMs = performance.now() - started;

      const { outcome, metrics } = await pending;

      latest = metrics;

      return outcome;
    },
    fit: (request: BodyFitRequest) => client.call('fit', request),
    dispose: () => {
      const started = performance.now();

      client.dispose();
      cancellationMs = performance.now() - started;
    },
  };
}

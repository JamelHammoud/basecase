import type { BodyRecordingRequest } from './bodyRecordingRun';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotRun } from '../robot/runBuffer';
import { workerClient } from '../utils/workerRpc';
import type { BodyCalibration } from './bodyTypes';
import type { measuredBodyAnalysis, BodyAnalysisMetrics } from './bodyAnalysisMetrics';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodyMotionRequest } from './bodyMotionTypes';
import type { measuredBodyMotion } from './bodyMotionMetrics';
import type { BodySequenceRequest, BodySequence } from './bodySequenceTypes';

export interface BodyFitRequest {
  validation?: RobotRun;
  training?: RobotRun[];
  model: SimModel;
  run: RobotRun;
  robot: string;
}

type BodyHandlers = {
  readRecording: (request: BodyRecordingRequest) => Promise<{ result: RobotRun | null }>;
  analyze: (request: BodyAnalysisRequest) => Promise<{ result: Awaited<ReturnType<typeof measuredBodyAnalysis>> }>;
  fit: (request: BodyFitRequest) => Promise<{ result: BodyCalibration }>;
  recommend: (request: BodyMotionRequest) => Promise<{ result: Awaited<ReturnType<typeof measuredBodyMotion>> }>;
  prepareSequence: (request: BodySequenceRequest) => Promise<{ result: BodySequence }>;
  advanceSequence: (request: {
    request: BodyAnalysisRequest;
    sequence: BodySequence;
  }) => Promise<{ result: BodySequence }>;
  validateSequence: (request: {
    request: BodyAnalysisRequest;
    sequence: BodySequence;
  }) => Promise<{ result: BodySequence }>;
};

let latest: BodyAnalysisMetrics | null = null;
let cancellationMs = 0;
let submissionMs = 0;
let motion: Awaited<ReturnType<typeof measuredBodyMotion>>['metrics'] | null = null;
let stopMotion: (() => void) | null = null;

export const bodyAnalysisMetrics = () => ({ analysis: latest, motion, cancellationMs, submissionMs });

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
        recommend: async (request) => {
          const { measuredBodyMotion } = await import('./bodyMotionMetrics');

          return { result: await measuredBodyMotion(request) };
        },
        prepareSequence: async (request) => {
          const { prepareBodySequence } = await import('./bodySequence');

          return { result: await prepareBodySequence(request) };
        },
        advanceSequence: async ({ request, sequence }) => {
          const { advanceBodySequence } = await import('./bodySequence');

          return { result: await advanceBodySequence(request, sequence) };
        },
        validateSequence: async (request) => {
          const { validateBodySequence } = await import('./bodySequenceValidation');

          return { result: await validateBodySequence(request) };
        },
      };
    },
  );

  const dispose = () => {
    const started = performance.now();

    client.dispose();
    cancellationMs = performance.now() - started;

    if (stopMotion === dispose) stopMotion = null;
  };

  return {
    prepareSequence: (request: BodySequenceRequest) => client.call('prepareSequence', request),
    advanceSequence: (request: { request: BodyAnalysisRequest; sequence: BodySequence }) =>
      client.call('advanceSequence', request),
    validateSequence: (request: { request: BodyAnalysisRequest; sequence: BodySequence }) =>
      client.call('validateSequence', request),
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
    recommend: async (request: BodyMotionRequest) => {
      stopMotion?.();
      stopMotion = dispose;

      const started = performance.now();
      const pending = client.call('recommend', request);

      submissionMs = performance.now() - started;

      try {
        const result = await pending;

        motion = result.metrics;

        return result.outcome;
      } finally {
        if (stopMotion === dispose) stopMotion = null;
      }
    },
    dispose,
  };
}

import { reply } from '../utils/workerRpc';
import { fitBody } from './fitBody';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodyRecordingRequest } from './bodyRecordingRun';
import type { BodyFitRequest } from './bodyClient';
import type { BodyMotionRequest } from './bodyMotionTypes';

export const bodyWorkerHandlers = {
  readRecording: async (request: BodyRecordingRequest) => {
    const { readBodyRecording } = await import('./bodyRecordingRun');

    return reply(readBodyRecording(request));
  },
  fit: async (request: BodyFitRequest) => reply(await fitBody(request)),
  recommend: async (request: BodyMotionRequest) => {
    const { measuredBodyMotion } = await import('./bodyMotionMetrics');

    return reply(await measuredBodyMotion(request));
  },
  analyze: async (request: BodyAnalysisRequest) => {
    const { measuredBodyAnalysis } = await import('./bodyAnalysisMetrics');

    return reply(await measuredBodyAnalysis(request));
  },
};

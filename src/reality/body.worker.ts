/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { fitBody } from './fitBody';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodyRecordingRequest } from './bodyRecordingRun';
import type { BodyFitRequest } from './bodyClient';

serve({
  readRecording: async (request: BodyRecordingRequest) => {
    const { readBodyRecording } = await import('./bodyRecordingRun');

    return reply(readBodyRecording(request));
  },
  fit: async (request: BodyFitRequest) => reply(await fitBody(request)),
  analyze: async (request: BodyAnalysisRequest) => {
    const { measuredBodyAnalysis } = await import('./bodyAnalysisMetrics');

    return reply(await measuredBodyAnalysis(request));
  },
});

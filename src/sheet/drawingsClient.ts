import { workerClient } from '../utils/workerRpc';
import type { DrawingJob, DrawingManifest } from './drawingTypes';

export interface DrawingMetrics {
  projectionMs: number;
  prepareMs: number;
  layoutMs: number;
  compressionMs?: number;
}

export interface PreparedDrawings {
  manifest: DrawingManifest;
  files: Record<string, Uint8Array>;
  metrics?: DrawingMetrics;
}

type DrawingHandlers = {
  build: (
    job: DrawingJob,
  ) => Promise<{ result: { manifest: DrawingManifest; bytes: Uint8Array; metrics: DrawingMetrics } }>;
  files: (job: DrawingJob) => Promise<{ result: PreparedDrawings }>;
};

export function drawingsClient() {
  return workerClient<DrawingHandlers>(
    () => new Worker(new URL('./drawings.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof document !== 'undefined') throw new Error('Drawings export needs a worker.');

      const { buildDrawings, prepareDrawingFiles } = await import('./drawings');

      return {
        build: async (job) => ({ result: await buildDrawings(job) }),
        files: async (job) => ({ result: await prepareDrawingFiles(job) }),
      };
    },
  );
}

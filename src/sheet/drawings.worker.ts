import { reply, serve } from '../utils/workerRpc';
import { buildDrawings, prepareDrawingFiles } from './drawings';
import type { DrawingJob } from './drawingTypes';

serve({
  build: async (job: DrawingJob) => {
    const result = await buildDrawings(job);

    return reply(result, [result.bytes.buffer]);
  },
  files: async (job: DrawingJob) => {
    const { manifest, files, metrics } = await prepareDrawingFiles(job);

    return reply(
      { manifest, files, metrics },
      Object.values(files).map((file) => file.buffer),
    );
  },
});

/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { buildDataset, type DatasetJob } from './buildDataset';
import { renderTryFrames, type TryFramesJob } from './renderFrames';
import { zipFolder } from '../utils/zipFolder';

serve({
  zip: async (job: DatasetJob) => {
    const zip = zipFolder(job.name, await buildDataset(job));

    return reply(zip, [zip.buffer]);
  },
  files: async (job: DatasetJob) => {
    const files = await buildDataset(job);

    return reply(
      files,
      Object.values(files).map((b) => b.buffer),
    );
  },
  frames: async (job: TryFramesJob) => {
    const frames = await renderTryFrames(job);

    return reply(
      frames,
      frames.map((f) => f.data.buffer),
    );
  },
});

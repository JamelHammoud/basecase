/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { buildDataset, type DatasetJob } from './buildDataset';
import { zipDataset } from './zipDataset';

serve({
  zip: async (job: DatasetJob) => {
    const zip = zipDataset(job.name, await buildDataset(job));

    return reply(zip, [zip.buffer]);
  },
  files: async (job: DatasetJob) => {
    const files = await buildDataset(job);

    return reply(
      files,
      Object.values(files).map((b) => b.buffer),
    );
  },
});

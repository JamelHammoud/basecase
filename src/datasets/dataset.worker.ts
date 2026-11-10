/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { buildDataset, type DatasetJob } from './buildDataset';

serve({
  build: async (job: DatasetJob) => {
    const zip = await buildDataset(job);

    return reply(zip, [zip.buffer]);
  },
});

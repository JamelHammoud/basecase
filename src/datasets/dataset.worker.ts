/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { buildDataset, type DatasetJob } from './buildDataset';
import { zipFolder } from '../utils/zipFolder';
import { datasetArchiveFiles } from './archiveFiles';

serve({
  archive: (bytes: Uint8Array) => {
    const files = datasetArchiveFiles(bytes);

    return reply(
      files,
      Object.values(files).map((file) => file.buffer),
    );
  },
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
});

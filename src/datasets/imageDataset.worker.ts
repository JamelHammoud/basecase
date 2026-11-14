/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { zipFolder } from '../utils/zipFolder';
import { imageDatasetFiles, type ImageDatasetJob } from './imageDatasetFiles';

serve({
  files: async (job: ImageDatasetJob) => {
    const files = imageDatasetFiles(job);

    return reply(files, [...new Set(Object.values(files).map((bytes) => bytes.buffer))]);
  },
  zip: async (job: ImageDatasetJob) => {
    const zip = zipFolder(job.name, imageDatasetFiles(job));

    return reply(zip, [zip.buffer]);
  },
});

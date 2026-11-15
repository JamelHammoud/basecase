import type { Dataset } from '../datasets/datasetFile';
import { reply } from '../utils/workerRpc';
import { zipFolder } from '../utils/zipFolder';
import type { FrameSet } from './frameSet';
import { buildImageDataset } from './imageDatasetBuild';

interface Job {
  dataset: Dataset;
  sets: FrameSet[];
  extraFiles: Record<string, Uint8Array>;
}

export const imageDatasetJobs = {
  files: async ({ dataset, sets, extraFiles }: Job) => {
    const files = { ...extraFiles, ...(await buildImageDataset(dataset, sets)) };
    const transfer = Object.values(files)
      .map((bytes) => bytes.buffer)
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

    return reply(files, [...new Set(transfer)]);
  },
  zip: async ({ dataset, sets, extraFiles }: Job) => {
    const bytes = zipFolder(dataset.id, { ...extraFiles, ...(await buildImageDataset(dataset, sets)) });

    return reply(bytes, [bytes.buffer]);
  },
};

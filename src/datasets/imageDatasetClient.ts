import { workerClient } from '../utils/workerRpc';
import type { ImageDatasetJob } from './imageDatasetFiles';

type ImageDatasetHandlers = {
  files: (job: ImageDatasetJob) => Promise<{ result: Record<string, Uint8Array> }>;
  zip: (job: ImageDatasetJob) => Promise<{ result: Uint8Array }>;
};

const localHandlers = async (): Promise<ImageDatasetHandlers> => {
  if (typeof window !== 'undefined') throw new Error('The image export worker stopped. Export the dataset again.');

  const { imageDatasetFiles } = await import('./imageDatasetFiles');
  const { zipFolder } = await import('../utils/zipFolder');

  return {
    files: async (job) => ({ result: imageDatasetFiles(job) }),
    zip: async (job) => ({ result: zipFolder(job.name, imageDatasetFiles(job)) }),
  };
};

const client = workerClient<ImageDatasetHandlers>(
  () => new Worker(new URL('./imageDataset.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

const transferOf = (job: ImageDatasetJob) => [
  ...new Set([
    ...job.sets.flatMap((set) => set.frames.flatMap((frame) => [frame.image.buffer, frame.depth.buffer])),
    ...Object.values(job.extraFiles ?? {}).map((bytes) => bytes.buffer),
  ]),
];

export const exportImageDatasetFiles = (job: ImageDatasetJob): Promise<Record<string, Uint8Array>> =>
  client.call('files', job, transferOf(job));

export const exportImageDatasetZip = (job: ImageDatasetJob): Promise<Uint8Array> =>
  client.call('zip', job, transferOf(job));

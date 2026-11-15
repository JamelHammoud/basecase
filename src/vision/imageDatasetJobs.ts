import type { Dataset } from '../datasets/datasetFile';
import { reply } from '../utils/workerRpc';
import { zipFolder } from '../utils/zipFolder';
import type { FrameSet } from './frameSet';
import { buildImageDataset } from './imageDatasetBuild';
import type { FrozenImageSample } from '../datasets/snapshotImages';
import { packImageSnapshots, unpackImageSnapshot } from './imageSnapshot';
import type { ImageMembers } from '../datasets/datasetFile';

interface Job {
  dataset: Dataset;
  sets: FrameSet[];
  extraFiles: Record<string, Uint8Array>;
  images?: FrozenImageSample[];
}

export const imageDatasetJobs = {
  packSnapshots: async ({ set, member }: { set: FrameSet; member: ImageMembers }) => {
    const packed = await packImageSnapshots(set, member);
    const transfer = packed.map(({ bytes }) => bytes.buffer).filter((buffer) => buffer instanceof ArrayBuffer);

    return reply(packed, transfer);
  },
  unpackSnapshot: async ({ sample, bytes }: { sample: FrozenImageSample; bytes: Uint8Array }) => {
    const set = await unpackImageSnapshot(sample, bytes);
    const transfer = set.frames
      .flatMap((frame) => [frame.jpeg.buffer, frame.depth.buffer])
      .filter((buffer) => buffer instanceof ArrayBuffer);

    return reply(set, transfer);
  },
  snapshotJpeg: async ({ sample, bytes }: { sample: FrozenImageSample; bytes: Uint8Array }) => {
    const set = await unpackImageSnapshot(sample, bytes);
    const jpeg = set.frames[0].jpeg;

    return reply(
      jpeg,
      [jpeg.buffer].filter((buffer) => buffer instanceof ArrayBuffer),
    );
  },
  files: async ({ dataset, sets, extraFiles, images }: Job) => {
    const files = { ...extraFiles, ...(await buildImageDataset(dataset, sets, images)) };
    const transfer = Object.values(files)
      .map((bytes) => bytes.buffer)
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

    return reply(files, [...new Set(transfer)]);
  },
  zip: async ({ dataset, sets, extraFiles, images }: Job) => {
    const bytes = zipFolder(dataset.id, { ...extraFiles, ...(await buildImageDataset(dataset, sets, images)) });

    return reply(bytes, [bytes.buffer]);
  },
};

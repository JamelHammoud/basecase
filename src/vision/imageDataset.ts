import type { Dataset } from '../datasets/datasetFile';
import type { FrameSet } from './frameSet';
import { loadFrameSet } from './frameSetStore';
import { imageDatasetWorker } from './imageDatasetWorker';
import { restoreImages, type FrozenImageSample } from '../datasets/snapshotImages';

type Load = (id: string) => Promise<FrameSet | null>;

async function memberSets(dataset: Dataset, load: Load) {
  const sets: FrameSet[] = [];

  for (const id of new Set((dataset.imageMembers ?? []).map((member) => member.frameSetId))) {
    const set = await load(id);

    if (!set) throw new Error('The dataset is missing its images.');

    sets.push(set);
  }

  return sets;
}

interface Delivery {
  dataset: Dataset;
  load: Load;
  extraFiles: Record<string, Uint8Array>;
  images?: FrozenImageSample[];
}

async function deliver<K extends 'files' | 'zip'>(kind: K, { dataset, load, extraFiles, images }: Delivery) {
  const sets = images ? await restoreImages(images) : await memberSets(dataset, load);
  const transfer = [
    ...sets.flatMap((set) => set.frames.flatMap((frame) => [frame.jpeg.buffer, frame.depth.buffer])),
    ...Object.values(extraFiles).map((bytes) => bytes.buffer),
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

  return imageDatasetWorker.call(kind, { dataset, sets, extraFiles, images }, [...new Set(transfer)]);
}

export const imageDatasetFiles = (
  dataset: Dataset,
  load: Load = loadFrameSet,
  extraFiles: Record<string, Uint8Array> = {},
  images?: FrozenImageSample[],
): Promise<Record<string, Uint8Array>> => deliver('files', { dataset, load, extraFiles, images });
export const imageDatasetZip = (
  dataset: Dataset,
  extraFiles: Record<string, Uint8Array> = {},
  images?: FrozenImageSample[],
): Promise<Uint8Array> => deliver('zip', { dataset, load: loadFrameSet, extraFiles, images });

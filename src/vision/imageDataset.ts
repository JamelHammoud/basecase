import type { Dataset } from '../datasets/datasetFile';
import { workerClient } from '../utils/workerRpc';
import type { FrameSet } from './frameSet';
import { loadFrameSet } from './frameSetStore';
import type { imageDatasetJobs } from './imageDatasetJobs';

const worker = workerClient<typeof imageDatasetJobs>(
  () => new Worker(new URL('./imageDataset.worker.ts', import.meta.url), { type: 'module' }),
  async () => (await import('./imageDatasetJobs')).imageDatasetJobs,
);

type Load = (id: string) => Promise<FrameSet | null>;

async function deliver<K extends 'files' | 'zip'>(
  kind: K,
  dataset: Dataset,
  load: Load,
  extraFiles: Record<string, Uint8Array>,
) {
  const sets: FrameSet[] = [];

  for (const id of new Set((dataset.imageMembers ?? []).map((member) => member.frameSetId))) {
    const set = await load(id);

    if (!set) throw new Error('The dataset is missing its images.');

    sets.push(set);
  }

  const transfer = [
    ...sets.flatMap((set) => set.frames.flatMap((frame) => [frame.jpeg.buffer, frame.depth.buffer])),
    ...Object.values(extraFiles).map((bytes) => bytes.buffer),
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

  return worker.call(kind, { dataset, sets, extraFiles }, [...new Set(transfer)]);
}

export const imageDatasetFiles = (
  dataset: Dataset,
  load: Load = loadFrameSet,
  extraFiles: Record<string, Uint8Array> = {},
): Promise<Record<string, Uint8Array>> => deliver('files', dataset, load, extraFiles);
export const imageDatasetZip = (dataset: Dataset, extraFiles: Record<string, Uint8Array> = {}): Promise<Uint8Array> =>
  deliver('zip', dataset, loadFrameSet, extraFiles);

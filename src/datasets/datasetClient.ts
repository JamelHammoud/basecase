import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { recordingTransfer } from '../sim/recorder';
import { workerClient } from '../utils/workerRpc';
import type { DatasetFiles, DatasetJob } from './buildDataset';
import type { TryFrame, TryFramesJob } from './renderFrames';
import type { ScenePart } from '../types/robotics';

type DatasetHandlers = {
  zip: (job: DatasetJob) => Promise<{ result: Uint8Array }>;
  files: (job: DatasetJob) => Promise<{ result: DatasetFiles }>;
  frames: (job: TryFramesJob) => Promise<{ result: TryFrame[] }>;
};

const localHandlers = async (): Promise<DatasetHandlers> => {
  const { buildDataset } = await import('./buildDataset');
  const { zipFolder } = await import('../utils/zipFolder');
  const { renderTryFrames } = await import('./renderFrames');

  return {
    zip: async (job) => ({ result: zipFolder(job.name, await buildDataset(job)) }),
    files: async (job) => ({ result: await buildDataset(job) }),
    frames: async (job) => ({ result: await renderTryFrames(job) }),
  };
};

const client = workerClient<DatasetHandlers>(
  () => new Worker(new URL('./dataset.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export type DatasetSpec = Omit<DatasetJob, 'meshes'>;

const withMeshes = async <T extends { parts: ScenePart[]; world: ScenePart[] }>(job: T) => ({
  ...job,
  parts: packParts(job.parts),
  world: packParts(job.world),
  meshes: await sourcedMeshFiles([...job.parts, ...job.world]),
});

async function build<K extends 'zip' | 'files'>(output: K, job: DatasetSpec) {
  return client.call(
    output,
    await withMeshes(job),
    job.episodes.flatMap((e) => recordingTransfer(e.recording)),
  );
}

export const exportDatasetZip = (job: DatasetSpec): Promise<Uint8Array> => build('zip', job);

export const exportDatasetFiles = (job: DatasetSpec): Promise<DatasetFiles> => build('files', job);

export const renderTryFrames = async (job: Omit<TryFramesJob, 'meshes'>): Promise<TryFrame[]> =>
  client.call('frames', await withMeshes(job));

import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { recordingTransfer } from '../sim/recorder';
import { workerClient } from '../utils/workerRpc';
import type { DatasetFiles, DatasetJob } from './buildDataset';

type DatasetHandlers = {
  zip: (job: DatasetJob) => Promise<{ result: Uint8Array }>;
  files: (job: DatasetJob) => Promise<{ result: DatasetFiles }>;
};

const localHandlers = async (): Promise<DatasetHandlers> => {
  const { buildDataset } = await import('./buildDataset');
  const { zipDataset } = await import('./zipDataset');

  return {
    zip: async (job) => ({ result: zipDataset(job.name, await buildDataset(job)) }),
    files: async (job) => ({ result: await buildDataset(job) }),
  };
};

const client = workerClient<DatasetHandlers>(
  () => new Worker(new URL('./dataset.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export type DatasetSpec = Omit<DatasetJob, 'meshes'>;

async function build<K extends keyof DatasetHandlers>(output: K, job: DatasetSpec) {
  const all = [...job.parts, ...job.world];
  const packed = {
    ...job,
    parts: packParts(job.parts),
    world: packParts(job.world),
    meshes: await sourcedMeshFiles(all),
  };

  return client.call(
    output,
    packed,
    job.episodes.flatMap((e) => recordingTransfer(e.recording)),
  );
}

export const exportDatasetZip = (job: DatasetSpec): Promise<Uint8Array> => build('zip', job);

export const exportDatasetFiles = (job: DatasetSpec): Promise<DatasetFiles> => build('files', job);

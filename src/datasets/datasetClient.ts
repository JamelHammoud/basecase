import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { recordingTransfer } from '../sim/recorder';
import { workerClient } from '../utils/workerRpc';
import type { DatasetJob } from './buildDataset';

type DatasetHandlers = { build: (job: DatasetJob) => Promise<{ result: Uint8Array }> };

const localHandlers = async (): Promise<DatasetHandlers> => {
  const { buildDataset } = await import('./buildDataset');

  return { build: async (job) => ({ result: await buildDataset(job) }) };
};

const client = workerClient<DatasetHandlers>(
  () => new Worker(new URL('./dataset.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

export async function exportDatasetZip(job: Omit<DatasetJob, 'meshes'>): Promise<Uint8Array> {
  const all = [...job.parts, ...job.world];
  const packed = {
    ...job,
    parts: packParts(job.parts),
    world: packParts(job.world),
    meshes: await sourcedMeshFiles(all),
  };

  return client.call(
    'build',
    packed,
    job.episodes.flatMap((e) => recordingTransfer(e.recording)),
  );
}

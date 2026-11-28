import { workerClient } from '../utils/workerRpc';
import { renderMeshFiles } from './componentMeshes';
import { packParts } from './packedMesh';
import type { ThumbnailJob } from './thumbnailRender';

type ThumbnailHandlers = { render: (job: ThumbnailJob) => Promise<{ result: Blob | null }> };

const unavailableHandlers = async (): Promise<ThumbnailHandlers> => ({
  render: async () => ({ result: null }),
});

const client = workerClient<ThumbnailHandlers>(
  () => new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' }),
  unavailableHandlers,
);

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the image'));
    reader.readAsDataURL(blob);
  });

async function renderBlob(job: ThumbnailJob): Promise<Blob | null> {
  return client.call('render', {
    ...job,
    parts: packParts(job.parts),
    meshes: await renderMeshFiles(job.parts),
  });
}

export async function renderThumbnailImage(job: ThumbnailJob): Promise<string> {
  const blob = job.parts.length ? await renderBlob(job) : null;

  return blob ? dataUrl(blob) : '';
}

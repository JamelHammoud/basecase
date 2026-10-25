import { workerClient } from '../utils/workerRpc';
import { packParts } from './packedMesh';
import { renderThumbnailJob, type ThumbnailJob } from './thumbnailRender';

type ThumbnailHandlers = { render: (job: ThumbnailJob) => Promise<{ result: Blob | null }> };

const localHandlers = async (): Promise<ThumbnailHandlers> => ({
  render: async (job) => ({ result: await renderThumbnailJob(job) }),
});

const client = workerClient<ThumbnailHandlers>(
  () => new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' }),
  localHandlers,
);

let workerFailed = false;

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the image'));
    reader.readAsDataURL(blob);
  });

async function renderBlob(job: ThumbnailJob): Promise<Blob | null> {
  if (workerFailed) return renderThumbnailJob(job);

  try {
    return await client.call('render', { ...job, parts: packParts(job.parts) });
  } catch {
    workerFailed = true;

    return renderThumbnailJob(job);
  }
}

export async function renderThumbnailImage(job: ThumbnailJob): Promise<string> {
  const blob = job.parts.length ? await renderBlob(job) : null;

  return blob ? dataUrl(blob) : '';
}

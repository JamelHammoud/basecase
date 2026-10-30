import { fittedSize, imageHandlers, type EncodeJob } from './imageOps';
import type { LabelJob } from './labelOverlay';
import { workerClient } from './workerRpc';

const client = workerClient<typeof imageHandlers>(
  () => new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' }),
  async () => imageHandlers,
);

export const canEncodeOffThread = () =>
  typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the image'));
    reader.readAsDataURL(blob);
  });

function encodeOnPage({ bitmap, maxSide, type, quality, background }: EncodeJob): string {
  const { width, height } = fittedSize(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = width;
  canvas.height = height;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL(type, quality);
}

export async function encodeBitmap(job: EncodeJob): Promise<string> {
  if (!canEncodeOffThread()) return encodeOnPage(job);

  return blobToDataUrl(await client.call('encode', job, [job.bitmap]));
}

export async function encodeLabelled(job: LabelJob): Promise<{ dataUrl: string; labels: number[] }> {
  if (!canEncodeOffThread()) {
    return { dataUrl: encodeOnPage({ bitmap: job.bitmap, maxSide: job.maxSide, type: 'image/png' }), labels: [] };
  }

  const { blob, labels } = await client.call('label', job, [job.bitmap]);

  return { dataUrl: await blobToDataUrl(blob), labels };
}

export const imageWorker = client;

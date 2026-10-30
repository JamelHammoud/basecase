import { renderLabelled, type LabelJob } from './labelOverlay';
import { viewFitHandlers } from './viewFitOps';
import { reply } from './workerRpc';

export interface EncodeJob {
  bitmap: ImageBitmap;
  maxSide?: number;
  type: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  background?: string;
}

export function fittedSize(width: number, height: number, maxSide?: number) {
  const scale = maxSide ? Math.min(1, maxSide / Math.max(width, height)) : 1;

  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const imageHandlers = {
  encode: async ({ bitmap, maxSide, type, quality, background }: EncodeJob) => {
    const { width, height } = fittedSize(bitmap.width, bitmap.height, maxSide);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return reply(await canvas.convertToBlob({ type, quality }));
  },
  label: async (job: LabelJob) => reply(await renderLabelled(job)),
  ...viewFitHandlers,
};

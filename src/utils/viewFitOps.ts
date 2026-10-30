import type { Mask } from './silhouetteProfile';
import { overlayPixels } from './targetFit';
import { alignModel, fitDetail, rgbaMask, type Alignment } from './viewFit';
import { reply } from './workerRpc';

function bitmapMask(bitmap: ImageBitmap): Mask {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return rgbaMask(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

export interface FitScoreJob {
  bitmap: ImageBitmap;
  photo: Mask;
  rolls: number[];
}

export interface FitDetailJob {
  bitmap: ImageBitmap;
  photo: Mask;
  align: Alignment;
}

async function encodeOverlay(detail: ReturnType<typeof fitDetail>): Promise<Blob> {
  const pixels = overlayPixels(detail.grid, 1);
  const canvas = new OffscreenCanvas(pixels.width, pixels.height);

  canvas.getContext('2d')!.putImageData(pixels, 0, 0);

  return canvas.convertToBlob({ type: 'image/png' });
}

export const viewFitHandlers = {
  fitScore: ({ bitmap, photo, rolls }: FitScoreJob) => reply(alignModel(photo, bitmapMask(bitmap), rolls)),
  fitDetail: async ({ bitmap, photo, align }: FitDetailJob) => {
    const detail = fitDetail(photo, bitmapMask(bitmap), align);

    return reply({
      iou: detail.iou,
      contourPx: detail.contourPx,
      photo: detail.photo,
      model: detail.model,
      overlay: await encodeOverlay(detail),
    });
  },
};

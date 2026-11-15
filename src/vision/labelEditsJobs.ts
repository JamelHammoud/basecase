import { reply } from '../utils/workerRpc';
import { labelGeometry, type LabelGeometry } from './labelEdits';
import { decodeMask } from './imageMasks';
import type { ImageMask } from './frameSet';

function maskPoint(mask: ImageMask): [number, number] {
  const pixels = decodeMask(mask);
  const index = pixels.findIndex(Boolean);

  if (index < 0) throw new Error('Choose a label with a visible mask.');

  return [index % mask.size[1], Math.floor(index / mask.size[1])];
}

export const labelEditsJobs = {
  geometry: (input: LabelGeometry) => reply(labelGeometry(input)),
  maskGeometry: (input: Omit<LabelGeometry, 'pixels'> & { mask: ImageMask }) =>
    reply(labelGeometry({ ...input, pixels: decodeMask(input.mask) })),
  maskPoint: (mask: ImageMask) => reply(maskPoint(mask)),
};
